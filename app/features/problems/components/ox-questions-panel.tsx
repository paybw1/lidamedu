// 정오문제 패널 — 조문 viewer 우측 탭. 지문 단위 O/X 채점 + 해설.

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleXIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import { CommentsPanel } from "~/features/comments/components/comments-panel";
import { ORIGIN_LABEL, type ProblemOrigin } from "~/features/problems/labels";
import { stripLeadingMarker } from "~/features/problems/lib/ox-dedup";
import type {
  OxQuestionItem,
  OxRefAnnotations,
  OxTruth,
} from "~/features/problems/labels";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

// 출처 구분 토글 — 전체 / 기출 / 기타(그 외). 학생이 기출을 먼저 풀고 예상 등은 선택적으로.
// 기출 = past_exam + past_exam_variant(기출변형도 기출로 분류). 기타 = 예상·모의·AI초안 등.
type OxOriginFilter = "all" | "past_exam" | "other";

// "기출" 분류 = 실제 기출 + 기출변형.
function isPastExamOrigin(origin: string): boolean {
  return origin === "past_exam" || origin === "past_exam_variant";
}

const OX_ORIGIN_OPTIONS: { value: OxOriginFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "past_exam", label: "기출" },
  { value: "other", label: "기타" },
];

function OxOriginToggle({
  value,
  onChange,
  counts,
}: {
  value: OxOriginFilter;
  onChange: (v: OxOriginFilter) => void;
  counts: Record<OxOriginFilter, number>;
}) {
  return (
    <div
      className="bg-muted text-muted-foreground inline-flex h-7 items-center rounded-lg p-[3px]"
      role="group"
      aria-label="정오문제 출처 구분"
      data-testid="ox-origin-toggle"
    >
      {OX_ORIGIN_OPTIONS.map(({ value: v, label }) => {
        const active = value === v;
        const n = counts[v];
        const disabled = v !== "all" && n === 0;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-[#2D5BA8] shadow-sm dark:text-[#8FB4E3]"
                : "hover:text-foreground",
              disabled &&
                "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            {label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OxQuestionsPanel({
  items,
  subject,
  annotationsByRef,
  isStaff = false,
  currentUserId = null,
  isAdmin = false,
}: {
  items: OxQuestionItem[];
  subject: LawSubjectSlug;
  annotationsByRef?: Record<string, OxRefAnnotations>;
  isStaff?: boolean;
  /** 코멘트 작성 가능 여부 판정용 — 로그인 사용자 id. */
  currentUserId?: string | null;
  /** 코멘트 고정/전체 관리 권한(운영자). */
  isAdmin?: boolean;
}) {
  const location = useLocation();
  // staff "수정" 왕복 후 편집하던 지문으로 복귀 — ?ox=<refId> 로 초기 위치를 지정.
  const restoreRefId = new URLSearchParams(location.search).get("ox");
  const [idx, setIdx] = useState<number>(() => {
    if (!restoreRefId) return 0;
    const i = items.findIndex((it) => it.refId === restoreRefId);
    return i >= 0 ? i : 0;
  });
  const [picked, setPicked] = useState<OxTruth | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 정답 확인 후 표시되는 보조 패널: 'bookmark' | 'comment' | null.
  const [annoOpen, setAnnoOpen] = useState<"bookmark" | "comment" | null>(null);
  const [originFilter, setOriginFilter] = useState<OxOriginFilter>("all");
  // 학생 개인 숨김: 기본은 숨긴 지문 제외, 토글 켜면 복원용으로 함께 표시.
  const [showHidden, setShowHidden] = useState(false);
  const attemptFetcher = useFetcher();
  const hideFetcher = useFetcher();
  const userHideFetcher = useFetcher();
  const startedAtRef = useRef<number>(Date.now());
  // 한 지문당 1회만 기록 (다시 풀기 → 동일 지문 재기록 방지). refId 단위.
  const recordedRefIdRef = useRef<string | null>(null);

  // 출처별 개수(토글 라벨) + 현재 토글로 거른 목록.
  const counts = useMemo<Record<OxOriginFilter, number>>(() => {
    let past = 0;
    for (const it of items) if (isPastExamOrigin(it.origin)) past += 1;
    return { all: items.length, past_exam: past, other: items.length - past };
  }, [items]);
  const filteredItems = useMemo(
    () =>
      originFilter === "all"
        ? items
        : items.filter((it) =>
            originFilter === "past_exam"
              ? isPastExamOrigin(it.origin)
              : !isPastExamOrigin(it.origin),
          ),
    [items, originFilter],
  );

  // items 가 "내용상" 바뀌면(또는 출처 토글 변경 시) 처음으로 (다른 조문/장 이동 등).
  // 단순히 items 참조만 비교하면 fetcher.submit 의 loader revalidate 로 새 배열이
  // 내려올 때마다 idx/picked/revealed 가 리셋되어 정답 확인 박스가 접힘.
  // refId 시퀀스 시그니처로 비교해 실제 변경된 경우에만 리셋.
  const itemsKey = items.map((it) => it.refId).join("|");
  const didInitRef = useRef(false);
  useEffect(() => {
    // 최초 마운트는 ?ox=<refId> 로 잡은 초기 위치를 보존(리셋 skip).
    // 이후 조문/장 이동(itemsKey 변경)·출처 토글 변경 시에만 처음으로 리셋.
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    setIdx(0);
    setPicked(null);
    setRevealed(false);
    setAnnoOpen(null);
    startedAtRef.current = Date.now();
    recordedRefIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, originFilter]);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        이 조문에는 정오문제로 풀 수 있는 지문이 아직 없습니다.
      </p>
    );
  }

  const toggleEl = (
    <div className="flex justify-end">
      <OxOriginToggle
        value={originFilter}
        onChange={setOriginFilter}
        counts={counts}
      />
    </div>
  );

  if (filteredItems.length === 0) {
    return (
      <div className="space-y-3" data-testid="ox-panel">
        {toggleEl}
        <p className="text-muted-foreground text-xs leading-relaxed">
          이 분류에 해당하는 정오문제가 없습니다.
        </p>
      </div>
    );
  }

  // 학생 개인 숨김(user_ox_hidden) — 숨긴 지문은 기본 회전에서 제외.
  const isUserHidden = (refId: string) =>
    annotationsByRef?.[refId]?.userHidden ?? false;
  const userHiddenCount = filteredItems.filter((it) =>
    isUserHidden(it.refId),
  ).length;
  const workingItems = showHidden
    ? filteredItems
    : filteredItems.filter((it) => !isUserHidden(it.refId));

  // 개인 숨김 보기 토글(학생만) — 숨긴 지문이 있을 때만 노출.
  const hiddenToggleEl =
    !isStaff && userHiddenCount > 0 ? (
      <button
        type="button"
        onClick={() => {
          setShowHidden((v) => !v);
          setIdx(0);
          setPicked(null);
          setRevealed(false);
        }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
      >
        {showHidden ? (
          <>
            <EyeOffIcon className="size-3" /> 숨긴 지문 감추기
          </>
        ) : (
          <>
            <EyeIcon className="size-3" /> 숨긴 지문 {userHiddenCount}개 보기
          </>
        )}
      </button>
    ) : null;

  if (workingItems.length === 0) {
    // 이 분류의 지문을 학생이 전부 개인 숨김한 경우.
    return (
      <div className="space-y-3" data-testid="ox-panel">
        {toggleEl}
        <p className="text-muted-foreground text-xs leading-relaxed">
          숨긴 지문을 제외하면 표시할 정오문제가 없습니다.
        </p>
        {hiddenToggleEl}
      </div>
    );
  }

  const pos = Math.min(idx, workingItems.length - 1);
  const cur = workingItems[pos];
  const curHidden = isUserHidden(cur.refId);
  // staff "수정" 진입 URL — 저장 후 이 viewer 로, 그리고 편집하던 지문(cur)으로 복귀.
  const editSp = new URLSearchParams(location.search);
  editSp.set("ox", cur.refId);
  const editReturnTo = `${location.pathname}?${editSp.toString()}`;
  const isCorrect = picked !== null && picked === cur.oxTruth;
  const isWrong = picked !== null && picked !== cur.oxTruth;

  const handlePick = (choice: OxTruth) => {
    if (revealed) return;
    setPicked(choice);
    setRevealed(true);
    // 첫 응답만 기록. 같은 지문에서 다시 풀기 후 같은 답을 골라도 중복 기록 안 함.
    if (recordedRefIdRef.current === cur.refId) return;
    recordedRefIdRef.current = cur.refId;
    const fd = new FormData();
    fd.set("problemId", cur.problemId);
    fd.set("oxAnswer", choice);
    fd.set("isCorrect", choice === cur.oxTruth ? "true" : "false");
    fd.set("mode", "study");
    fd.set(
      "timeSpentMs",
      String(Math.max(0, Date.now() - startedAtRef.current)),
    );
    if (cur.refType === "choice") {
      fd.set("selectedChoiceId", cur.refId);
    } else {
      fd.set("selectedBoxItemId", cur.refId);
    }
    attemptFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/attempt",
    });
  };

  const goNext = () => {
    setIdx((i) => (i + 1) % workingItems.length);
    setPicked(null);
    setRevealed(false);
    setAnnoOpen(null);
    startedAtRef.current = Date.now();
    recordedRefIdRef.current = null;
  };

  const reset = () => {
    setPicked(null);
    setRevealed(false);
    setAnnoOpen(null);
  };

  const annoTargetType =
    cur.refType === "choice" ? "problem_choice" : "problem_box_item";
  const curAnno = annotationsByRef?.[cur.refId];
  const commentCount = curAnno?.comments.length ?? 0;
  const starLevel = curAnno?.bookmark?.starLevel ?? 0;

  return (
    <div className="space-y-3" data-testid="ox-panel">
      <div className="flex items-center justify-between gap-2">
        <div>{hiddenToggleEl}</div>
        {toggleEl}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {ORIGIN_LABEL[cur.origin as ProblemOrigin] ?? cur.origin}
        </Badge>
        {cur.year ? (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {cur.year}
            {cur.problemNumber ? ` · ${cur.problemNumber}번` : ""}
          </Badge>
        ) : null}
        {cur.dupCount && cur.dupCount > 1 ? (
          <Badge variant="outline" className="text-[10px]">
            여러 회차 출제 {cur.dupCount}
          </Badge>
        ) : null}
        {isStaff && cur.oxHidden ? (
          <Badge
            variant="outline"
            className="border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-300"
          >
            숨김됨
          </Badge>
        ) : null}
        {!isStaff && curHidden ? (
          <Badge
            variant="outline"
            className="border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-300"
          >
            내가 숨김
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px] tabular-nums">
            {pos + 1} / {workingItems.length}
          </span>
          {isStaff ? (
            <hideFetcher.Form
              method="post"
              action="/api/problems/ox-review-update"
            >
              <input type="hidden" name="refType" value={cur.refType} />
              <input type="hidden" name="refId" value={cur.refId} />
              <input
                type="hidden"
                name="oxHidden"
                value={cur.oxHidden ? "false" : "true"}
              />
              <button
                type="submit"
                disabled={hideFetcher.state !== "idle"}
                title={
                  cur.oxHidden
                    ? "숨김 해제 — 학생에게 다시 노출"
                    : "이 정오문제 숨기기 — 학생 비노출(중복·부적합)"
                }
                aria-label={cur.oxHidden ? "숨김 해제" : "숨기기"}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                  cur.oxHidden
                    ? "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {cur.oxHidden ? (
                  <EyeIcon className="size-3.5" />
                ) : (
                  <EyeOffIcon className="size-3.5" />
                )}
              </button>
            </hideFetcher.Form>
          ) : (
            <userHideFetcher.Form
              method="post"
              action="/api/problems/ox-user-hide"
            >
              <input type="hidden" name="refType" value={cur.refType} />
              <input type="hidden" name="refId" value={cur.refId} />
              <input
                type="hidden"
                name="hidden"
                value={curHidden ? "false" : "true"}
              />
              <button
                type="submit"
                disabled={userHideFetcher.state !== "idle"}
                title={
                  curHidden
                    ? "숨김 해제 — 다시 이 지문을 봄"
                    : "이 지문 숨기기 — 나에게만 안 보이게"
                }
                aria-label={curHidden ? "숨김 해제" : "숨기기"}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                  curHidden
                    ? "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {curHidden ? (
                  <EyeIcon className="size-3.5" />
                ) : (
                  <EyeOffIcon className="size-3.5" />
                )}
              </button>
            </userHideFetcher.Form>
          )}
        </div>
      </div>

      <p className="font-serif text-sm leading-relaxed">
        {stripLeadingMarker(cur.bodyMd)}
      </p>

      <div className="flex gap-2">
        <Button
          variant={isCorrect && picked === "O" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePick("O")}
          disabled={revealed}
          className={cn(
            "flex-1",
            picked === "O" && isCorrect &&
              "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
            picked === "O" && isWrong &&
              "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
          )}
          data-testid="ox-pick-O"
        >
          O
        </Button>
        <Button
          variant={isCorrect && picked === "X" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePick("X")}
          disabled={revealed}
          className={cn(
            "flex-1",
            picked === "X" && isCorrect &&
              "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
            picked === "X" && isWrong &&
              "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200",
          )}
          data-testid="ox-pick-X"
        >
          X
        </Button>
      </div>

      {revealed ? (
        <div
          className="bg-muted/40 space-y-2 rounded-md border p-3"
          data-testid="ox-result"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            {isCorrect ? (
              <>
                <CheckCircle2Icon className="size-4 text-emerald-600" /> 정답
              </>
            ) : (
              <>
                <CircleXIcon className="size-4 text-rose-600" /> 오답
              </>
            )}
            <span className="text-muted-foreground">
              · 정답:{" "}
              <span className="text-foreground font-bold">{cur.oxTruth}</span>
            </span>
          </p>
          {cur.explanationMd ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {cur.explanationMd}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs italic">
              해설이 아직 등록되지 않았습니다.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <Button
              type="button"
              variant={annoOpen === "bookmark" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setAnnoOpen((v) => (v === "bookmark" ? null : "bookmark"))
              }
              className="h-7 gap-1 text-xs"
              aria-pressed={annoOpen === "bookmark"}
              data-testid="ox-toggle-bookmark"
            >
              <HeartIcon
                className={cn(
                  "size-3",
                  starLevel > 0 && "fill-rose-500 text-rose-500",
                )}
              />
              즐겨찾기
              {starLevel > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  {starLevel}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant={annoOpen === "comment" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setAnnoOpen((v) => (v === "comment" ? null : "comment"))
              }
              className="h-7 gap-1 text-xs"
              aria-pressed={annoOpen === "comment"}
              data-testid="ox-toggle-comment"
            >
              <MessageSquarePlusIcon className="size-3" />
              코멘트
              {commentCount > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  {commentCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="h-7 text-xs"
            >
              <RefreshCcwIcon className="size-3" /> 다시 풀기
            </Button>
            <Button
              size="sm"
              onClick={goNext}
              className="ml-auto h-7 text-xs"
              data-testid="ox-next"
            >
              다음 지문 <ArrowRightIcon className="size-3" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
            >
              <Link
                to={`/subjects/${subject}/problems/${cur.problemId}`}
                viewTransition
              >
                원문제 →
              </Link>
            </Button>
            {isStaff ? (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link
                  to={`/admin/problems/${cur.problemId}?returnTo=${encodeURIComponent(editReturnTo)}`}
                  viewTransition
                >
                  <PencilIcon className="size-3.5" /> 수정
                </Link>
              </Button>
            ) : null}
          </div>

          {annoOpen === "bookmark" ? (
            <div
              className="bg-background mt-2 rounded-md border p-3"
              data-testid="ox-bookmark-panel"
            >
              <BookmarkStars
                key={`bm:${cur.refId}`}
                targetType={annoTargetType}
                targetId={cur.refId}
                initial={curAnno?.bookmark ?? null}
              />
            </div>
          ) : null}

          {annoOpen === "comment" ? (
            <div
              className="bg-background mt-2 rounded-md border p-3"
              data-testid="ox-comment-panel"
            >
              <CommentsPanel
                key={`comment:${cur.refId}`}
                targetType={annoTargetType}
                targetId={cur.refId}
                comments={curAnno?.comments ?? []}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                emptyHint="이 정오문제 지문에 대한 코멘트가 아직 없습니다."
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// 정오문제 패널 — 조문 viewer 우측 탭. 지문 단위 O/X 채점 + 해설.
// 한 번에 보는 지문 수(1~5)를 학생이 선택 — 카드는 refId 키로 독립 상태(채점/해설/즐겨찾기/코멘트)를 가진다.

import {
  ArrowLeftIcon,
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
import { stripLeadingOxMark } from "~/features/problems/lib/auto-ox";
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

// 한 번에 보는 지문 수 옵션(학생 선택).
const PAGE_SIZE_OPTIONS = [1, 2, 3, 4, 5] as const;

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
                ? "bg-background text-link shadow-sm"
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

// 한 번에 보는 지문 수 선택(1~5). 남은 지문 수보다 큰 값은 비활성.
function OxPageSizeToggle({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium">
        한 번에
      </span>
      <div
        className="bg-muted text-muted-foreground inline-flex h-7 items-center rounded-lg p-[3px]"
        role="group"
        aria-label="한 번에 보는 정오문제 수"
        data-testid="ox-page-size"
      >
        {PAGE_SIZE_OPTIONS.map((n) => {
          const active = value === n;
          const disabled = n > max;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                "inline-flex h-full w-6 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors",
                active
                  ? "bg-background text-link shadow-sm"
                  : "hover:text-foreground",
                disabled &&
                  "cursor-not-allowed opacity-40 hover:text-muted-foreground",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <span className="text-muted-foreground text-[11px]">개</span>
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
  const [originFilter, setOriginFilter] = useState<OxOriginFilter>("all");
  // 학생 개인 숨김: 기본은 숨긴 지문 제외, 토글 켜면 복원용으로 함께 표시.
  const [showHidden, setShowHidden] = useState(false);
  // 한 번에 보는 지문 수(1~5) + 현재 창 시작 위치.
  const [pageSize, setPageSize] = useState(1);
  const [pageStart, setPageStart] = useState<number>(() => {
    if (!restoreRefId) return 0;
    const i = items.findIndex((it) => it.refId === restoreRefId);
    return i >= 0 ? i : 0;
  });

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

  // items 가 "내용상" 바뀌면(또는 출처 토글 변경 시) 창을 처음으로 (다른 조문/장 이동 등).
  // 단순히 items 참조만 비교하면 fetcher.submit 의 loader revalidate 로 새 배열이
  // 내려올 때마다 창이 리셋됨 — refId 시퀀스 시그니처로 실제 변경 시에만 리셋.
  const itemsKey = items.map((it) => it.refId).join("|");
  const didInitRef = useRef(false);
  useEffect(() => {
    // 최초 마운트는 ?ox=<refId> 로 잡은 초기 위치를 보존(리셋 skip).
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    setPageStart(0);
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
          setPageStart(0);
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

  // 현재 창(window) — pageStart 부터 pageSize 개.
  const start = Math.min(pageStart, Math.max(0, workingItems.length - 1));
  const effSize = Math.min(pageSize, PAGE_SIZE_OPTIONS.length);
  const windowItems = workingItems.slice(start, start + effSize);
  const windowEnd = start + windowItems.length; // exclusive
  const hasPrev = start > 0;
  const hasNext = windowEnd < workingItems.length || start > 0; // 끝에서는 처음으로 회전

  const goNext = () => {
    setPageStart(windowEnd >= workingItems.length ? 0 : windowEnd);
  };
  const goPrev = () => {
    setPageStart(Math.max(0, start - effSize));
  };

  return (
    <div className="space-y-3" data-testid="ox-panel">
      <div className="flex items-center justify-between gap-2">
        <div>{hiddenToggleEl}</div>
        {toggleEl}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <OxPageSizeToggle
          value={pageSize}
          onChange={(v) => {
            setPageSize(v);
            setPageStart(0);
          }}
          max={Math.min(PAGE_SIZE_OPTIONS.length, workingItems.length)}
        />
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {start + 1}
          {windowItems.length > 1 ? `–${windowEnd}` : ""} /{" "}
          {workingItems.length}
        </span>
      </div>

      <div className="space-y-3">
        {windowItems.map((item, i) => {
          const editSp = new URLSearchParams(location.search);
          editSp.set("ox", item.refId);
          const editReturnTo = `${location.pathname}?${editSp.toString()}`;
          return (
            <OxPanelCard
              key={item.refId}
              item={item}
              displayNo={start + i + 1}
              subject={subject}
              anno={annotationsByRef?.[item.refId]}
              userHidden={isUserHidden(item.refId)}
              isStaff={isStaff}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              editReturnTo={editReturnTo}
              bordered={windowItems.length > 1}
            />
          );
        })}
      </div>

      {workingItems.length > effSize ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={!hasPrev}
            className="h-7 text-xs"
          >
            <ArrowLeftIcon className="size-3" /> 이전
          </Button>
          <Button
            size="sm"
            onClick={goNext}
            disabled={!hasNext}
            className="h-7 text-xs"
            data-testid="ox-next"
          >
            다음 <ArrowRightIcon className="size-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// 단일 정오문제 카드 — refId 키로 마운트되어 독립 상태(채점/해설/즐겨찾기/코멘트)를 가진다.
function OxPanelCard({
  item,
  displayNo,
  subject,
  anno,
  userHidden,
  isStaff,
  currentUserId,
  isAdmin,
  editReturnTo,
  bordered,
}: {
  item: OxQuestionItem;
  displayNo: number;
  subject: LawSubjectSlug;
  anno: OxRefAnnotations | undefined;
  userHidden: boolean;
  isStaff: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  editReturnTo: string;
  bordered: boolean;
}) {
  const [picked, setPicked] = useState<OxTruth | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 정답 확인 후 표시되는 보조 패널: 'bookmark' | 'comment' | null.
  const [annoOpen, setAnnoOpen] = useState<"bookmark" | "comment" | null>(null);
  const attemptFetcher = useFetcher();
  const hideFetcher = useFetcher();
  const userHideFetcher = useFetcher();
  const startedAtRef = useRef<number>(Date.now());
  const recordedRef = useRef(false);

  const isCorrect = picked !== null && picked === item.oxTruth;
  const isWrong = picked !== null && picked !== item.oxTruth;

  const handlePick = (choice: OxTruth) => {
    if (revealed) return;
    setPicked(choice);
    setRevealed(true);
    // 첫 응답만 기록.
    if (recordedRef.current) return;
    recordedRef.current = true;
    const fd = new FormData();
    fd.set("problemId", item.problemId);
    fd.set("oxAnswer", choice);
    fd.set("isCorrect", choice === item.oxTruth ? "true" : "false");
    fd.set("mode", "study");
    fd.set(
      "timeSpentMs",
      String(Math.max(0, Date.now() - startedAtRef.current)),
    );
    if (item.refType === "choice") {
      fd.set("selectedChoiceId", item.refId);
    } else {
      fd.set("selectedBoxItemId", item.refId);
    }
    attemptFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/attempt",
    });
  };

  const reset = () => {
    setPicked(null);
    setRevealed(false);
    setAnnoOpen(null);
  };

  const annoTargetType =
    item.refType === "choice" ? "problem_choice" : "problem_box_item";
  const commentCount = anno?.comments.length ?? 0;
  const starLevel = anno?.bookmark?.starLevel ?? 0;

  return (
    <div
      className={cn(
        "space-y-3",
        bordered && "border-border bg-card rounded-lg border p-3",
      )}
      data-testid="ox-card"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-[11px] font-bold tabular-nums">
          {displayNo}.
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {ORIGIN_LABEL[item.origin as ProblemOrigin] ?? item.origin}
        </Badge>
        {item.year ? (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {item.year}
            {item.problemNumber ? ` · ${item.problemNumber}번` : ""}
          </Badge>
        ) : null}
        {item.dupCount && item.dupCount > 1 ? (
          <Badge variant="outline" className="text-[10px]">
            여러 회차 출제 {item.dupCount}
          </Badge>
        ) : null}
        {isStaff && item.oxHidden ? (
          <Badge
            variant="outline"
            className="border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-300"
          >
            숨김됨
          </Badge>
        ) : null}
        {!isStaff && userHidden ? (
          <Badge
            variant="outline"
            className="border-amber-400/60 text-[10px] text-amber-700 dark:text-amber-300"
          >
            내가 숨김
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {isStaff ? (
            <hideFetcher.Form
              method="post"
              action="/api/problems/ox-review-update"
            >
              <input type="hidden" name="refType" value={item.refType} />
              <input type="hidden" name="refId" value={item.refId} />
              <input
                type="hidden"
                name="oxHidden"
                value={item.oxHidden ? "false" : "true"}
              />
              <button
                type="submit"
                disabled={hideFetcher.state !== "idle"}
                title={
                  item.oxHidden
                    ? "숨김 해제 — 학생에게 다시 노출"
                    : "이 정오문제 숨기기 — 학생 비노출(중복·부적합)"
                }
                aria-label={item.oxHidden ? "숨김 해제" : "숨기기"}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                  item.oxHidden
                    ? "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.oxHidden ? (
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
              <input type="hidden" name="refType" value={item.refType} />
              <input type="hidden" name="refId" value={item.refId} />
              <input
                type="hidden"
                name="hidden"
                value={userHidden ? "false" : "true"}
              />
              <button
                type="submit"
                disabled={userHideFetcher.state !== "idle"}
                title={
                  userHidden
                    ? "숨김 해제 — 다시 이 지문을 봄"
                    : "이 지문 숨기기 — 나에게만 안 보이게"
                }
                aria-label={userHidden ? "숨김 해제" : "숨기기"}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md transition-colors disabled:opacity-50",
                  userHidden
                    ? "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {userHidden ? (
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
        {stripLeadingMarker(item.bodyMd)}
      </p>

      <div className="flex gap-2">
        <Button
          variant={isCorrect && picked === "O" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePick("O")}
          disabled={revealed}
          className={cn(
            "flex-1",
            picked === "O" &&
              isCorrect &&
              "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
            picked === "O" &&
              isWrong &&
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
            picked === "X" &&
              isCorrect &&
              "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200",
            picked === "X" &&
              isWrong &&
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
              <span className="text-foreground font-bold">{item.oxTruth}</span>
            </span>
          </p>
          {item.explanationMd ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {stripLeadingOxMark(item.explanationMd)}
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
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link
                to={`/subjects/${subject}/problems/${item.problemId}`}
                viewTransition
              >
                원문제 →
              </Link>
            </Button>
            {isStaff ? (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link
                  to={`/admin/problems/${item.problemId}?returnTo=${encodeURIComponent(editReturnTo)}`}
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
                key={`bm:${item.refId}`}
                targetType={annoTargetType}
                targetId={item.refId}
                initial={anno?.bookmark ?? null}
              />
            </div>
          ) : null}

          {annoOpen === "comment" ? (
            <div
              className="bg-background mt-2 rounded-md border p-3"
              data-testid="ox-comment-panel"
            >
              <CommentsPanel
                key={`comment:${item.refId}`}
                targetType={annoTargetType}
                targetId={item.refId}
                comments={anno?.comments ?? []}
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

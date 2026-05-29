// 정오문제 패널 — 조문 viewer 우측 탭. 지문 단위 O/X 채점 + 해설.

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleXIcon,
  HeartIcon,
  NotebookPenIcon,
  PencilIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import { MemoList } from "~/features/annotations/components/memo-list";
import { ORIGIN_LABEL, type ProblemOrigin } from "~/features/problems/labels";
import type {
  OxQuestionItem,
  OxRefAnnotations,
  OxTruth,
} from "~/features/problems/labels";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

// OX 지문 앞 항목 번호 — (가) (ㄱ) [ㄱ] ㄱ. ① 등 — 제거 (정오문제는 지문 하나 단위라 번호가 불필요).
function stripLeadingMarker(text: string): string {
  let s = text.trimStart();
  const marker =
    /^(?:[([（［][가-힣ㄱ-ㅎ\d]+[)\]）］]|[가-힣ㄱ-ㅎ]\.|[①-⑳]|\d+[.)])\s*/;
  while (marker.test(s)) s = s.replace(marker, "").trimStart();
  return s;
}

export function OxQuestionsPanel({
  items,
  subject,
  annotationsByRef,
  isStaff = false,
}: {
  items: OxQuestionItem[];
  subject: LawSubjectSlug;
  annotationsByRef?: Record<string, OxRefAnnotations>;
  isStaff?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<OxTruth | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 정답 확인 후 표시되는 보조 패널: 'bookmark' | 'memo' | null.
  const [annoOpen, setAnnoOpen] = useState<"bookmark" | "memo" | null>(null);
  const attemptFetcher = useFetcher();
  const startedAtRef = useRef<number>(Date.now());
  // 한 지문당 1회만 기록 (다시 풀기 → 동일 지문 재기록 방지). refId 단위.
  const recordedRefIdRef = useRef<string | null>(null);

  // items 가 "내용상" 바뀌면 처음으로 (다른 조문/장으로 이동 등).
  // 단순히 items 참조만 비교하면 fetcher.submit 의 loader revalidate 로 새 배열이
  // 내려올 때마다 idx/picked/revealed 가 리셋되어 정답 확인 박스가 접힘.
  // refId 시퀀스 시그니처로 비교해 실제 변경된 경우에만 리셋.
  const itemsKey = items.map((it) => it.refId).join("|");
  useEffect(() => {
    setIdx(0);
    setPicked(null);
    setRevealed(false);
    setAnnoOpen(null);
    startedAtRef.current = Date.now();
    recordedRefIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        이 조문에 OX 가능 지문이 아직 분류되지 않았습니다.
      </p>
    );
  }

  const cur = items[idx];
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
    setIdx((i) => (i + 1) % items.length);
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
  const memoCount = curAnno?.memos.length ?? 0;
  const starLevel = curAnno?.bookmark?.starLevel ?? 0;

  return (
    <div className="space-y-3" data-testid="ox-panel">
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
        <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
          {idx + 1} / {items.length}
        </span>
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
              해설 미입력.
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
              variant={annoOpen === "memo" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setAnnoOpen((v) => (v === "memo" ? null : "memo"))
              }
              className="h-7 gap-1 text-xs"
              aria-pressed={annoOpen === "memo"}
              data-testid="ox-toggle-memo"
            >
              <NotebookPenIcon className="size-3" />
              메모
              {memoCount > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  {memoCount}
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
                <Link to={`/admin/problems/${cur.problemId}`} viewTransition>
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

          {annoOpen === "memo" ? (
            <div
              className="bg-background mt-2 rounded-md border p-3"
              data-testid="ox-memo-panel"
            >
              <MemoList
                key={`memo:${cur.refId}`}
                targetType={annoTargetType}
                targetId={cur.refId}
                initial={curAnno?.memos ?? []}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

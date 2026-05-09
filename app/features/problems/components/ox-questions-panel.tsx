// 정오문제 패널 — 조문 viewer 우측 탭. 지문 단위 O/X 채점 + 해설.

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleXIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { ORIGIN_LABEL, type ProblemOrigin } from "~/features/problems/labels";
import type {
  OxQuestionItem,
  OxTruth,
} from "~/features/problems/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export function OxQuestionsPanel({
  items,
  subject,
}: {
  items: OxQuestionItem[];
  subject: LawSubjectSlug;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<OxTruth | null>(null);
  const [revealed, setRevealed] = useState(false);

  // items 가 바뀌면 처음으로.
  useEffect(() => {
    setIdx(0);
    setPicked(null);
    setRevealed(false);
  }, [items]);

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
  };

  const goNext = () => {
    setIdx((i) => (i + 1) % items.length);
    setPicked(null);
    setRevealed(false);
  };

  const reset = () => {
    setPicked(null);
    setRevealed(false);
  };

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

      <p className="text-sm leading-relaxed">{cur.bodyMd}</p>

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
          <div className="flex gap-2 pt-1">
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
              className="h-7 flex-1 text-xs"
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

// OX 지문 카드 — 정오문제 시험 러너(mcq-pack-ox-exam) + 회차 결과 뷰(my-ox-session-result)
// 공용(드리프트 0). submitted=true 면 채점 표시(정답/오답/미응답 + 정답 + 해설).
// 결과 뷰는 onAnswer=noop 로 읽기 전용 렌더에 재사용한다.
import { CircleIcon, XCircleIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { OxQuestionItem, OxTruth } from "~/features/problems/labels";
import { stripLeadingOxMark } from "~/features/problems/lib/auto-ox";

export type Answer = OxTruth | null;

export function QuestionCard({
  item,
  index,
  answer,
  submitted,
  onAnswer,
}: {
  item: OxQuestionItem;
  index: number;
  answer: Answer;
  submitted: boolean;
  onAnswer: (v: OxTruth) => void;
}) {
  const correct = submitted ? answer === item.oxTruth : null;

  return (
    <div
      className={cn(
        "border-border bg-card rounded-2xl border p-4 shadow-sm transition-colors",
        submitted &&
          correct === true &&
          "border-emerald-500/40 bg-emerald-500/[0.04]",
        submitted &&
          correct === false &&
          "border-rose-500/40 bg-rose-500/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-muted-foreground w-7 shrink-0 pt-0.5 text-right text-xs tabular-nums">
          {index}
        </span>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {item.year && item.problemNumber ? (
              <Badge variant="outline" className="font-mono">
                {item.year} · {item.problemNumber}번
              </Badge>
            ) : null}
            <Badge variant="secondary" className="font-mono">
              {item.refType === "choice" ? "보기" : "박스"}
            </Badge>
            {submitted && correct === true && (
              <Badge
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-600"
              >
                정답
              </Badge>
            )}
            {submitted && correct === false && (
              <Badge variant="destructive">오답</Badge>
            )}
            {submitted && answer === null && (
              <Badge variant="secondary">미응답</Badge>
            )}
          </div>

          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {item.bodyMd}
          </p>

          <div className="flex items-center gap-2">
            <OxButton
              value="O"
              currentAnswer={answer}
              truth={item.oxTruth}
              submitted={submitted}
              onClick={() => onAnswer("O")}
            />
            <OxButton
              value="X"
              currentAnswer={answer}
              truth={item.oxTruth}
              submitted={submitted}
              onClick={() => onAnswer("X")}
            />
            {submitted && (
              <span className="text-muted-foreground ml-2 text-xs">
                정답:{" "}
                <strong className="text-foreground font-mono">
                  {item.oxTruth}
                </strong>
              </span>
            )}
          </div>

          {submitted && item.explanationMd && (
            <details className="bg-muted/40 mt-1 rounded-lg border p-2.5 text-xs">
              <summary className="cursor-pointer font-semibold">해설</summary>
              <p className="text-foreground/80 mt-2 leading-relaxed whitespace-pre-wrap">
                {stripLeadingOxMark(item.explanationMd)}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function OxButton({
  value,
  currentAnswer,
  truth,
  submitted,
  onClick,
}: {
  value: OxTruth;
  currentAnswer: Answer;
  truth: OxTruth;
  submitted: boolean;
  onClick: () => void;
}) {
  const isSelected = currentAnswer === value;
  const isCorrectAnswer = submitted && truth === value;
  const isWrongSelection = submitted && isSelected && truth !== value;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitted}
      aria-pressed={isSelected}
      className={cn(
        "border-input bg-background inline-flex h-9 w-12 items-center justify-center rounded-full border text-sm font-bold transition-all",
        !submitted &&
          (isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "hover:bg-muted hover:border-primary/30"),
        isCorrectAnswer && "border-emerald-500 bg-emerald-500 text-white",
        isWrongSelection && "border-rose-500 bg-rose-500 text-white",
        submitted && !isCorrectAnswer && !isWrongSelection && "opacity-60",
      )}
    >
      {value === "O" ? (
        <CircleIcon
          className={cn(
            "size-4",
            isSelected || isCorrectAnswer ? "stroke-[2.5]" : "",
          )}
        />
      ) : (
        <XCircleIcon
          className={cn(
            "size-4",
            isSelected || isCorrectAnswer ? "stroke-[2.5]" : "",
          )}
        />
      )}
    </button>
  );
}

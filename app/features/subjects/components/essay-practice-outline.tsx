// feat-2-036 S2 — 목차 연습: 발문만 보고 설문의 목차를 세운다.
//
// ★한 칸으로 받는다. 층별로 칸을 나눠 주면 "몇 층 몇 칸인지"를 알려주는 셈이라 정작
//   묻는 것(이 사안을 어떻게 쪼갤 것인가)이 사라진다.
// ★블록 제목을 그대로 보여 주지 않는다 — 그게 목차의 첫 줄이다. 「설문 (1)」과 배점만
//   내준다(지면 배분이 목차 훈련의 절반이라 배점은 연습 **전에** 보여야 한다).
// ★항목 수도 맞춰보기 전에는 감춘다. "15개"를 알려 주면 세부 목차를 몇 개 쪼갤지가
//   답이 되어 버린다.
//
// 입력 칸은 **비제어(uncontrolled)** 다. value 를 state 로 되쓰면 iPad 한글 입력에서
// 조합 중인 글자가 밀린다(암기 탭·도식 연습에서 이미 겪었다). 저장해 둔 초안도 state 가
// 아니라 ref 로 채운다 — SSR 결과와도 어긋나지 않는다.
import { CheckIcon, EraserIcon, ListOrderedIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { VERDICT_LABEL, type Verdict } from "~/features/cases/lib/answer-match";
import { type OutlineBlock, blockLabel } from "~/features/subjects/lib/essay-outline";
import {
  type OutlineScore,
  scoreOutline,
} from "~/features/subjects/lib/essay-outline-score";

const DRAFT_PREFIX = "subjectivePractice.outline";

const VERDICT_TONE: Record<Verdict, string> = {
  accepted:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  weak: "border-border bg-muted text-muted-foreground",
};

export function OutlinePractice({
  problemId,
  block,
}: {
  problemId: string;
  block: OutlineBlock;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [score, setScore] = useState<OutlineScore | null>(null);
  const key = `${DRAFT_PREFIX}.${problemId}.b${block.index}`;
  const { label, points } = blockLabel(block);

  // 초안 복원 — 렌더 결과에 넣지 않고 mount 뒤 ref 로 채운다.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && ref.current && !ref.current.value) ref.current.value = saved;
    } catch {
      // 저장소를 못 쓰는 환경(사파리 프라이빗 등) — 연습은 그대로 된다.
    }
  }, [key]);

  const saveDraft = () => {
    try {
      window.localStorage.setItem(key, ref.current?.value ?? "");
    } catch {
      // 초안 보존은 곁다리다 — 실패해도 연습을 막지 않는다.
    }
  };

  const check = () => {
    saveDraft();
    setScore(scoreOutline(block, ref.current?.value ?? ""));
  };

  const reset = () => {
    if (ref.current) ref.current.value = "";
    setScore(null);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 위와 같다 */
    }
  };

  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <ListOrderedIcon className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">{label} 목차 세우기</span>
        {points !== null ? (
          <Badge variant="outline" className="tabular-nums">
            {points}점
          </Badge>
        ) : null}
        {score ? (
          <span
            className={cn(
              "ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              VERDICT_TONE[score.verdict],
            )}
          >
            {VERDICT_LABEL[score.verdict]} · 항목 {score.hitCount}/{score.headings.length}
          </span>
        ) : null}
      </header>

      <p className="text-muted-foreground mb-2 text-xs">
        발문을 보고 이 설문의 목차를 세워 보세요. 층 표기(Ⅰ. / 1. / (1))를 그대로 써도 되고,
        줄바꿈으로만 나눠도 됩니다.
      </p>

      <Textarea
        ref={ref}
        rows={10}
        onBlur={saveDraft}
        placeholder={"Ⅰ. …\n  1. …\n    (1) …"}
        className="text-sm leading-relaxed"
      />

      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" onClick={check}>
          맞춰보기
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          <EraserIcon className="size-3.5" /> 지우기
        </Button>
      </div>

      {score ? <OutlineResult score={score} /> : null}
    </section>
  );
}

function OutlineResult({ score }: { score: OutlineScore }) {
  return (
    <div className="border-border mt-4 space-y-3 border-t pt-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold">모범답안 목차</p>
        <ul className="space-y-1">
          {score.headings.map((h, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm">
              {h.hit ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XIcon className="text-muted-foreground/60 mt-0.5 size-3.5 shrink-0" />
              )}
              <span
                className={cn(
                  h.hit ? "" : "text-muted-foreground",
                  h.outOfOrder && "underline decoration-amber-500 decoration-dotted",
                )}
              >
                {h.title}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ★순서는 안내만 한다 — 점수를 깎지 않는다. 순서가 다른 편이 나은 답안도 있고,
          실측 없이 감점 규칙을 넣으면 근거 없는 채점이 된다(설계 §5.1). */}
      {!score.orderOk ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          순서가 모범답안과 다릅니다 — {score.outOfOrder.slice(0, 3).join(" · ")}
          {score.outOfOrder.length > 3 ? ` 외 ${score.outOfOrder.length - 3}개` : ""}
          <span className="text-muted-foreground"> (점수에는 반영하지 않습니다)</span>
        </p>
      ) : null}

      {score.overall.missed.length ? (
        <div>
          <p className="text-muted-foreground mb-1 text-xs">
            놓친 말{score.overall.missedCount > score.overall.missed.length
              ? ` (${score.overall.missedCount}개 중 일부)`
              : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {score.overall.missed.map((t) => (
              <Badge key={t} variant="secondary" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

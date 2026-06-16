// feat-2-022 ⑨ — OX SRS 복습 러너 (/study/srs/ox).
// due OX ref 를 실제 O/X 로 풀어 정오 재기록 + SRS 스케줄 갱신:
//   답 → /api/problems/attempt (mode='study') → recordProblemAttempt → applyOxRefSrsUpdate.
// 기존 단절(풀기 → OX UI 없는 일반 MCQ 뷰어) 을 대체. 다과목 혼재라 subject 비의존 카드.
import {
  ArrowLeftIcon,
  CircleIcon,
  RepeatIcon,
  XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import type { OxQuestionItem, OxTruth } from "~/features/problems/labels";
import { getOxQuestionsForRefs } from "~/features/problems/queries.server";
import { getDueOxRefs } from "~/features/study/ox-srs.server";

import type { Route } from "./+types/srs-ox-review";

type ReviewItem = OxQuestionItem & { lawCode: string | null };

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 복습 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const due = await getDueOxRefs(client, user.id, 100);
  const choiceIds = due
    .filter((d) => d.refType === "choice")
    .map((d) => d.refId);
  const boxItemIds = due
    .filter((d) => d.refType === "box_item")
    .map((d) => d.refId);
  const built = await getOxQuestionsForRefs(client, choiceIds, boxItemIds);

  // due 의 lawCode(표시)·정렬 순서를 ref 단위로 머지.
  const lawByRef = new Map(due.map((d) => [d.refId, d.lawCode]));
  const orderByRef = new Map(due.map((d, i) => [d.refId, i]));
  const items: ReviewItem[] = built
    .map((it) => ({ ...it, lawCode: lawByRef.get(it.refId) ?? null }))
    .sort(
      (a, b) => (orderByRef.get(a.refId) ?? 0) - (orderByRef.get(b.refId) ?? 0),
    );

  return { items };
}

export default function SrsOxReview({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const [answered, setAnswered] = useState(0);
  const recorded = useRef<Set<string>>(new Set());

  function handleAnswer(item: ReviewItem, v: OxTruth) {
    if (recorded.current.has(item.refId)) return;
    recorded.current.add(item.refId);
    setAnswered((n) => n + 1);
    const fd = new FormData();
    fd.set("problemId", item.problemId);
    fd.set("oxAnswer", v);
    fd.set("isCorrect", v === item.oxTruth ? "true" : "false");
    fd.set("mode", "study");
    if (item.refType === "choice") fd.set("selectedChoiceId", item.refId);
    else fd.set("selectedBoxItemId", item.refId);
    // 베스트-에포트 기록 → recordProblemAttempt 가 user_ox_ref_srs 스케줄을 갱신.
    void fetch("/api/problems/attempt", { method: "POST", body: fd }).catch(
      () => {
        recorded.current.delete(item.refId);
        setAnswered((n) => Math.max(0, n - 1));
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            학습관리 · 정오문제 복습
          </p>
          <h1 className="text-2xl font-bold tracking-tight">정오문제 복습</h1>
          <p className="text-muted-foreground text-sm">
            오늘 복습할 정오문제 지문을 다시 채점합니다. 답하면 복습 일정이 자동
            갱신됩니다.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/study/srs" viewTransition>
            <ArrowLeftIcon className="size-3.5" /> 복습으로
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <RepeatIcon className="size-6 opacity-30" />
            <p>지금 복습할 정오문제 항목이 없습니다.</p>
            <Button size="sm" asChild className="mt-1">
              <Link to="/study/srs" viewTransition>
                복습 현황으로
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="border-border bg-muted/30 sticky top-2 z-10 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur">
            <Badge variant="outline" className="tabular-nums">
              채점 {answered}/{items.length}
            </Badge>
            <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{
                  width: `${(answered / Math.max(items.length, 1)) * 100}%`,
                }}
              />
            </div>
            {answered >= items.length ? (
              <Button size="sm" asChild className="h-7 rounded-full">
                <Link to="/study/srs" viewTransition>
                  복습 마치기
                </Link>
              </Button>
            ) : null}
          </div>
          <ol className="space-y-2.5">
            {items.map((it, i) => (
              <li key={`${it.refType}:${it.refId}`}>
                <ReviewCard item={it} index={i + 1} onAnswer={handleAnswer} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  index,
  onAnswer,
}: {
  item: ReviewItem;
  index: number;
  onAnswer: (item: ReviewItem, v: OxTruth) => void;
}) {
  const [picked, setPicked] = useState<OxTruth | null>(null);
  const revealed = picked !== null;
  const correct = revealed && picked === item.oxTruth;

  function pick(v: OxTruth) {
    if (revealed) return;
    setPicked(v);
    onAnswer(item, v);
  }

  return (
    <div
      className={cn(
        "border-border bg-card rounded-2xl border p-4 shadow-sm transition-colors",
        revealed && correct && "border-emerald-500/40 bg-emerald-500/[0.04]",
        revealed && !correct && "border-rose-500/40 bg-rose-500/[0.04]",
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
            {item.lawCode ? (
              <Badge variant="outline" className="font-mono">
                {item.lawCode}
              </Badge>
            ) : null}
            {revealed && correct && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">정답</Badge>
            )}
            {revealed && !correct && <Badge variant="destructive">오답</Badge>}
          </div>
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {item.bodyMd}
          </p>
          <div className="flex items-center gap-2">
            <OxButton
              value="O"
              picked={picked}
              truth={item.oxTruth}
              revealed={revealed}
              onClick={() => pick("O")}
            />
            <OxButton
              value="X"
              picked={picked}
              truth={item.oxTruth}
              revealed={revealed}
              onClick={() => pick("X")}
            />
            {revealed && (
              <span className="text-muted-foreground ml-2 text-xs">
                정답:{" "}
                <strong className="text-foreground font-mono">
                  {item.oxTruth}
                </strong>
              </span>
            )}
          </div>
          {revealed && item.explanationMd && (
            <details className="bg-muted/40 mt-1 rounded-lg border p-2.5 text-xs">
              <summary className="cursor-pointer font-semibold">해설</summary>
              <p className="text-foreground/80 mt-2 leading-relaxed whitespace-pre-wrap">
                {item.explanationMd}
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
  picked,
  truth,
  revealed,
  onClick,
}: {
  value: OxTruth;
  picked: OxTruth | null;
  truth: OxTruth;
  revealed: boolean;
  onClick: () => void;
}) {
  const isSelected = picked === value;
  const isCorrectAnswer = revealed && truth === value;
  const isWrongSelection = revealed && isSelected && truth !== value;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={revealed}
      aria-pressed={isSelected}
      className={cn(
        "border-input bg-background inline-flex h-9 w-12 items-center justify-center rounded-full border text-sm font-bold transition-all",
        !revealed &&
          (isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "hover:bg-muted hover:border-primary/30"),
        isCorrectAnswer && "border-emerald-500 bg-emerald-500 text-white",
        isWrongSelection && "border-rose-500 bg-rose-500 text-white",
        revealed && !isCorrectAnswer && !isWrongSelection && "opacity-60",
      )}
    >
      {value === "O" ? (
        <CircleIcon className="size-4" />
      ) : (
        <XCircleIcon className="size-4" />
      )}
    </button>
  );
}

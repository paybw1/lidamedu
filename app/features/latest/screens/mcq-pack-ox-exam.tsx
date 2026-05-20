// feat-3-301 / feat-4-A-114 연계 — 1차 진도별 모의고사 팩의 정오문제(OX) 시험 모드.
// 같은 팩(mcq_packs.kind=mock_progressive)을 객관식이 아니라 OX 지문 시험으로 풀이.
// 데이터 소스: 팩 문제들의 problem_choices · problem_box_items 중 OX 가능 지문.
//
// MVP — 한 페이지에 모든 지문 list + 제출 → 채점 결과(정답률 + 지문별 정답·해설 펼침).
// 응시 이력 저장은 추후 (현재는 클라이언트 state 만).

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { McqAreaShell } from "~/features/mcq-packs/components/mcq-area-shell";
import { isMockKind } from "~/features/mcq-packs/labels";
import { getPackById } from "~/features/mcq-packs/queries.server";
import type {
  OxQuestionItem,
  OxTruth,
} from "~/features/problems/labels";
import { getOxQuestionsForPack } from "~/features/problems/queries.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/mcq-pack-ox-exam";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack)
    return [{ title: "정오문제 시험 | Lidam Patent Attorney Academy" }];
  return [
    { title: `${d.pack.title} — 정오문제 시험 | Lidam Patent Attorney Academy` },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId) throw data("Missing packId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });
  // 진도별 모의고사 팩만 허용 (기출/종합 모의고사 등 다른 kind 는 후속)
  if (pack.kind !== "mock_progressive") {
    throw data("OX 시험 모드는 진도별 모의고사 팩에서만 지원합니다", {
      status: 400,
    });
  }
  if (!pack.isPublished) {
    throw data("Forbidden", { status: 403 });
  }
  // feat-8-008 area_mock_exams 게이트
  if (isMockKind(pack.kind)) {
    await requireFeature(client, user.id, "area_mock_exams");
  }

  const items = await getOxQuestionsForPack(client, params.packId);
  return { pack, items };
}

export default function McqPackOxExam({ loaderData }: Route.ComponentProps) {
  const { pack, items } = loaderData;
  return (
    <McqAreaShell
      isMock
      width="feed"
      backLink={{
        to: `/latest/mcq/${pack.packId}`,
        label: "팩 상세로",
      }}
      title={`${pack.title} — 정오문제 시험`}
      desc={`팩의 ${pack.problemCount}개 문제에서 추출된 ${items.length}개 OX 지문. 모두 풀고 제출하면 채점 결과를 표시합니다.`}
    >
      {items.length === 0 ? (
        <EmptyState packId={pack.packId} />
      ) : (
        <ExamRunner packId={pack.packId} items={items} />
      )}
    </McqAreaShell>
  );
}

function EmptyState({ packId }: { packId: string }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-8 text-center shadow-sm">
      <p className="text-foreground font-semibold">
        이 팩에 시험 가능한 OX 지문이 없습니다
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        팩 문제의 보기·박스 항목에 정답이 설정되어 있지 않거나, 모두 OX 평가
        부적합으로 표시되어 있습니다.
      </p>
      <Button asChild size="sm" className="mt-4">
        <Link to={`/latest/mcq/pack/${packId}`}>
          <ArrowLeftIcon className="size-3.5" /> 팩 상세로
        </Link>
      </Button>
    </div>
  );
}

type Answer = OxTruth | null;

function ExamRunner({
  packId,
  items,
}: {
  packId: string;
  items: OxQuestionItem[];
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => items.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const answered = useMemo(
    () => answers.filter((a) => a !== null).length,
    [answers],
  );

  const result = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    items.forEach((it, i) => {
      const a = answers[i];
      if (a === null) blank++;
      else if (a === it.oxTruth) correct++;
      else wrong++;
    });
    return { correct, wrong, blank, total: items.length };
  }, [submitted, items, answers]);

  function setAt(i: number, v: OxTruth) {
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function handleSubmit() {
    if (submitting) return;
    if (answered < items.length) {
      const ok = window.confirm(
        `${items.length - answered}개 미응답 지문이 있습니다. 그대로 제출할까요?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitted(true);
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 200);
  }

  function handleRetry() {
    setAnswers(items.map(() => null));
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-3">
      {/* 진행 상태 / 결과 카드 */}
      <header
        className={cn(
          "border-border sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur",
        )}
      >
        {!submitted ? (
          <>
            <p className="text-foreground text-sm font-semibold">
              진행{" "}
              <span className="tabular-nums">
                {answered}/{items.length}
              </span>
            </p>
            <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{
                  width: `${(answered / Math.max(items.length, 1)) * 100}%`,
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="rounded-full"
            >
              {submitting ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2Icon className="size-3.5" />
              )}
              제출 + 채점
            </Button>
          </>
        ) : result ? (
          <>
            <Badge variant="default" className="tabular-nums">
              정답 {result.correct}
            </Badge>
            <Badge variant="destructive" className="tabular-nums">
              오답 {result.wrong}
            </Badge>
            {result.blank > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                미응답 {result.blank}
              </Badge>
            )}
            <Badge variant="outline" className="tabular-nums">
              정답률{" "}
              {result.total > 0
                ? Math.round((result.correct / result.total) * 100)
                : 0}
              %
            </Badge>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                className="rounded-full"
              >
                <RotateCcwIcon className="size-3.5" /> 다시 풀기
              </Button>
            </div>
          </>
        ) : null}
      </header>

      {/* 지문 list */}
      <ol className="space-y-2.5">
        {items.map((it, i) => (
          <li key={`${it.refType}:${it.refId}`}>
            <QuestionCard
              item={it}
              index={i + 1}
              answer={answers[i]}
              submitted={submitted}
              onAnswer={(v) => setAt(i, v)}
            />
          </li>
        ))}
      </ol>

      {!submitted && (
        <div className="pt-2">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-full"
          >
            {submitting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CheckCircle2Icon className="size-4" />
            )}
            제출 + 채점
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
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
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
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

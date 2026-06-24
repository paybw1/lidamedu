// feat-10-006 — OX 오답 노트 (/me/ox-wrong-note).
// 본인의 user_problem_attempts.ox_answer IS NOT NULL 중 최근 응시가 is_correct=false 인 지문만
// 모아 다시 풀기. 제출 시 quiz_sessions(scope_type='wrong-note') + user_problem_attempts insert.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import type { OxQuestionItem, OxTruth } from "~/features/problems/labels";
import {
  type OxWrongItem,
  listMyOxWrongNoteItems,
} from "~/features/problems/queries.server";
import {
  ALL_RANGE_SELECTION,
  RangeSelectionGroup,
  inRangeSelection,
  isRangeSelectionAll,
  type RangeSelection,
} from "~/features/study/components/study-aids-list";

import type { Route } from "./+types/my-ox-wrong-note";

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 오답 노트 | 리담변리사학원" },
];

const submitItemSchema = z.object({
  refType: z.enum(["choice", "box"]),
  refId: z.string().uuid(),
  problemId: z.string().uuid(),
  userAnswer: z.enum(["O", "X"]).nullable(),
  oxTruth: z.enum(["O", "X"]),
  isCorrect: z.boolean(),
});
const submitSchema = z.object({
  intent: z.literal("submit"),
  durationMs: z.coerce.number().int().nonnegative(),
  itemsJson: z.string().min(2),
});

type SubmitResponse =
  | {
      ok: true;
      sessionId: string;
      correct: number;
      wrong: number;
      blank: number;
      total: number;
    }
  | { ok: false; error: string };

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const items = await listMyOxWrongNoteItems(client, user.id, 100);
  return { items };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ ok: false as const, error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data({ ok: false as const, error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const parsed = submitSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return data(
      { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  let items: z.infer<typeof submitItemSchema>[];
  try {
    const raw = JSON.parse(parsed.data.itemsJson);
    if (!Array.isArray(raw)) throw new Error("items 배열 아님");
    items = raw.map((r) => submitItemSchema.parse(r));
  } catch (e) {
    return data(
      { ok: false as const, error: e instanceof Error ? e.message : "items 파싱 실패" },
      { status: 400 },
    );
  }
  if (items.length === 0)
    return data({ ok: false as const, error: "응시 항목 없음" }, { status: 400 });

  const distinctProblemIds = [...new Set(items.map((i) => i.problemId))];
  // law_code 결정 — 첫 problem 의 law (subject_xor 만족용)
  const { data: lawRow } = await client
    .from("problems")
    .select("laws(law_code)")
    .in("problem_id", distinctProblemIds)
    .not("law_id", "is", null)
    .limit(1)
    .maybeSingle();
  const lawCode = (lawRow?.laws as unknown as { law_code: string } | null)?.law_code ?? null;
  let scienceSubject:
    | "physics"
    | "chemistry"
    | "biology"
    | "earth_science"
    | null = null;
  if (!lawCode) {
    const { data: sciRow } = await client
      .from("problems")
      .select("science_subject")
      .in("problem_id", distinctProblemIds)
      .not("science_subject", "is", null)
      .limit(1)
      .maybeSingle();
    scienceSubject =
      (sciRow?.science_subject as typeof scienceSubject) ?? null;
  }
  if (!lawCode && !scienceSubject)
    return data(
      { ok: false as const, error: "과목 식별 실패" },
      { status: 400 },
    );

  const startedAt = new Date(Date.now() - parsed.data.durationMs).toISOString();
  const completedAt = new Date().toISOString();
  const { data: sess, error: sErr } = await client
    .from("quiz_sessions")
    .insert({
      user_id: user.id,
      mode: "exam",
      law_code: lawCode,
      science_subject: scienceSubject,
      scope_type: "wrong-note",
      scope_payload: {
        ref_count: items.length,
        exam_kind: "ox",
        source: "ox_wrong_note",
      },
      problem_ids: distinctProblemIds,
      pack_id: null,
      started_at: startedAt,
      completed_at: completedAt,
    })
    .select("session_id")
    .single();
  if (sErr || !sess)
    return data(
      { ok: false as const, error: sErr?.message ?? "session insert 실패" },
      { status: 400 },
    );

  const perItemMs = Math.floor(parsed.data.durationMs / Math.max(items.length, 1));
  const attempts = items
    .filter((i) => i.userAnswer !== null)
    .map((i) => ({
      user_id: user.id,
      problem_id: i.problemId,
      selected_choice_id: i.refType === "choice" ? i.refId : null,
      selected_box_item_id: i.refType === "box" ? i.refId : null,
      ox_answer: i.userAnswer as OxTruth,
      is_correct: i.isCorrect,
      mode: "exam",
      session_id: sess.session_id,
      time_spent_ms: perItemMs,
    }));
  if (attempts.length > 0) {
    const { error: aErr } = await client
      .from("user_problem_attempts")
      .insert(attempts);
    if (aErr) {
      await client
        .from("quiz_sessions")
        .delete()
        .eq("session_id", sess.session_id);
      return data(
        { ok: false as const, error: aErr.message ?? "attempts insert 실패" },
        { status: 400 },
      );
    }
  }

  const correct = items.filter((i) => i.userAnswer !== null && i.isCorrect).length;
  const wrong = items.filter((i) => i.userAnswer !== null && !i.isCorrect).length;
  const blank = items.filter((i) => i.userAnswer === null).length;
  return data({
    ok: true as const,
    sessionId: sess.session_id,
    correct,
    wrong,
    blank,
    total: items.length,
  });
}

export default function MyOxWrongNote({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  const visible = items.filter((it) =>
    inRangeSelection((it as OxWrongItem).lastAttemptAt, rangeSel),
  );
  // runner key — 필터 변경 시 답안 상태 자동 리셋.
  const runnerKey =
    rangeSel.kind === "preset"
      ? rangeSel.preset
      : `custom:${rangeSel.from ?? ""}:${rangeSel.to ?? ""}`;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">정오문제 오답 노트</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          정오문제 시험·풀이에서 마지막 응답이 오답이었던 지문만 모아 다시
          풀어볼 수 있습니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {isRangeSelectionAll(rangeSel)
              ? `오답 ${items.length} 개`
              : `${visible.length} / ${items.length} 개`}
          </Badge>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to="/me/ox-sessions">
              <ArrowLeftIcon className="size-3.5" /> 응시 이력
            </Link>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RangeSelectionGroup
            value={rangeSel}
            onChange={setRangeSel}
            label="최근 시도"
          />
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center">
          <CheckCircle2Icon
            className="text-emerald-500 dark:text-emerald-400 mx-auto size-10"
            aria-hidden="true"
          />
          <p className="text-muted-foreground mt-3 text-sm">
            {items.length === 0
              ? "오답 노트가 비어있습니다. 모두 정답 처리되었거나 아직 정오문제 시험 응시 이력이 없습니다."
              : "선택한 기간에 해당하는 오답 지문이 없습니다."}
          </p>
        </div>
      ) : (
        <WrongNoteRunner key={runnerKey} items={visible} />
      )}
    </div>
  );
}

type Answer = OxTruth | null;

function WrongNoteRunner({ items }: { items: OxQuestionItem[] }) {
  const [answers, setAnswers] = useState<Answer[]>(() => items.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [startedAtMs] = useState(() => Date.now());
  const fetcher = useFetcher<SubmitResponse>();
  const submitting = fetcher.state !== "idle";
  const persisted = fetcher.data && fetcher.data.ok ? fetcher.data : null;
  const persistError =
    fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

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
    if (submitting || submitted) return;
    if (answered < items.length) {
      const ok = window.confirm(
        `${items.length - answered}개 미응답 지문이 있습니다. 그대로 제출하시겠습니까?`,
      );
      if (!ok) return;
    }
    setSubmitted(true);
    const payload = items.map((it, i) => ({
      refType: it.refType,
      refId: it.refId,
      problemId: it.problemId,
      userAnswer: answers[i],
      oxTruth: it.oxTruth,
      isCorrect: answers[i] === it.oxTruth,
    }));
    const fd = new FormData();
    fd.set("intent", "submit");
    fd.set("durationMs", String(Date.now() - startedAtMs));
    fd.set("itemsJson", JSON.stringify(payload));
    fetcher.submit(fd, { method: "post" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleRetry() {
    setAnswers(items.map(() => null));
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-3">
      <header className="border-border sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        {!submitted ? (
          <>
            <p className="text-foreground text-sm font-semibold">
              진행 <span className="tabular-nums">{answered}/{items.length}</span>
            </p>
            <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${(answered / Math.max(items.length, 1)) * 100}%` }}
              />
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="rounded-full">
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
            <Badge variant="default" className="tabular-nums">정답 {result.correct}</Badge>
            <Badge variant="destructive" className="tabular-nums">오답 {result.wrong}</Badge>
            {result.blank > 0 && (
              <Badge variant="secondary" className="tabular-nums">미응답 {result.blank}</Badge>
            )}
            <Badge variant="outline" className="tabular-nums">
              정답률 {result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0}%
            </Badge>
            {submitting ? (
              <Badge variant="outline" className="gap-1">
                <Loader2Icon className="size-3 animate-spin" />
                이력 저장 중
              </Badge>
            ) : persisted ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                <SaveIcon className="size-3" /> 이력 저장됨
              </Badge>
            ) : persistError ? (
              <Badge variant="destructive" className="gap-1">저장 실패: {persistError}</Badge>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRetry} disabled={submitting} className="rounded-full">
                <RotateCcwIcon className="size-3.5" /> 다시 풀기
              </Button>
            </div>
          </>
        ) : null}
      </header>

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
          <Button size="lg" onClick={handleSubmit} disabled={submitting} className="w-full rounded-full">
            {submitting ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}
            제출 + 채점
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  item, index, answer, submitted, onAnswer,
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
        submitted && correct === true && "border-emerald-500/40 bg-emerald-500/[0.04]",
        submitted && correct === false && "border-rose-500/40 bg-rose-500/[0.04]",
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
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">정답</Badge>
            )}
            {submitted && correct === false && <Badge variant="destructive">오답</Badge>}
          </div>
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {item.bodyMd}
          </p>
          <div className="flex items-center gap-2">
            <OxButton value="O" currentAnswer={answer} truth={item.oxTruth} submitted={submitted} onClick={() => onAnswer("O")} />
            <OxButton value="X" currentAnswer={answer} truth={item.oxTruth} submitted={submitted} onClick={() => onAnswer("X")} />
            {submitted && (
              <span className="text-muted-foreground ml-2 text-xs">
                정답: <strong className="text-foreground font-mono">{item.oxTruth}</strong>
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
  value, currentAnswer, truth, submitted, onClick,
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
      {value === "O" ? <CircleIcon className="size-4" /> : <XCircleIcon className="size-4" />}
    </button>
  );
}

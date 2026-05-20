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
  SaveIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

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

const SCOPE_TO_LAW_CODE: Record<string, string | null> = {
  industrial: "patent", // 산업재산권법 — 1차 모의고사 기본 과목
  civil: "civil",
  civil_procedure: "civil-procedure",
  science: null,
};

export async function action({ params, request }: Route.ActionArgs) {
  if (!params.packId)
    return data({ ok: false as const, error: "Missing packId" }, { status: 400 });
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
  if (!parsed.success) {
    return data(
      { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }
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
  if (items.length === 0) {
    return data({ ok: false as const, error: "응시 항목 없음" }, { status: 400 });
  }

  // pack 조회 — law_code 결정
  const pack = await getPackById(client, params.packId);
  if (!pack)
    return data({ ok: false as const, error: "Pack not found" }, { status: 404 });
  if (pack.kind !== "mock_progressive") {
    return data(
      { ok: false as const, error: "OX 시험은 진도별 모의고사 팩만 지원" },
      { status: 400 },
    );
  }
  // quiz_sessions.subject_xor: law_code OR science_subject 중 하나 NOT NULL.
  // 자연과학 팩은 첫 문제의 science_subject 를 채워서 만족시킨다.
  const lawCode = SCOPE_TO_LAW_CODE[pack.subjectScope] ?? null;
  const distinctProblemIds = [...new Set(items.map((i) => i.problemId))];
  let scienceSubject:
    | "physics"
    | "chemistry"
    | "biology"
    | "earth_science"
    | null = null;
  if (pack.subjectScope === "science") {
    const { data: firstSci } = await client
      .from("problems")
      .select("science_subject")
      .in("problem_id", distinctProblemIds)
      .not("science_subject", "is", null)
      .limit(1)
      .maybeSingle();
    scienceSubject =
      (firstSci?.science_subject as typeof scienceSubject) ?? null;
  }
  if (!lawCode && !scienceSubject) {
    return data(
      { ok: false as const, error: "과목 식별 실패 (law_code/science_subject 모두 null)" },
      { status: 400 },
    );
  }

  // quiz_sessions.scope_type check: 'node|filter|wrong-note|free|pack' 만 허용
  // → 'pack' 재사용 + scope_payload.exam_kind='ox' 로 OX 구분
  const startedAt = new Date(Date.now() - parsed.data.durationMs).toISOString();
  const completedAt = new Date().toISOString();
  const { data: sess, error: sErr } = await client
    .from("quiz_sessions")
    .insert({
      user_id: user.id,
      mode: "exam",
      law_code: lawCode,
      science_subject: scienceSubject,
      scope_type: "pack",
      scope_payload: {
        pack_id: params.packId,
        ref_count: items.length,
        exam_kind: "ox", // OX 시험 구분자 (객관식 'pack' 응시와 분리)
      },
      problem_ids: distinctProblemIds,
      pack_id: params.packId,
      started_at: startedAt,
      completed_at: completedAt,
    })
    .select("session_id")
    .single();
  if (sErr || !sess) {
    return data(
      { ok: false as const, error: sErr?.message ?? "session insert 실패" },
      { status: 400 },
    );
  }

  // 2) user_problem_attempts bulk
  const perItemMs = Math.floor(
    parsed.data.durationMs / Math.max(items.length, 1),
  );
  const attempts = items
    .filter((i) => i.userAnswer !== null) // 미응답은 attempt 저장 안 함
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
      // session row 정리
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
  const [startedAtMs] = useState(() => Date.now());
  const fetcher = useFetcher<SubmitResponse>();
  const submitting = fetcher.state !== "idle";
  const persisted =
    fetcher.data && fetcher.data.ok ? fetcher.data : null;
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
        `${items.length - answered}개 미응답 지문이 있습니다. 그대로 제출할까요?`,
      );
      if (!ok) return;
    }
    setSubmitted(true);
    // 응시 이력 DB 저장 — quiz_sessions(scope_type=mcq_pack_ox) + user_problem_attempts bulk
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
            {submitting ? (
              <Badge variant="outline" className="gap-1">
                <Loader2Icon className="size-3 animate-spin" />
                응시 이력 저장 중
              </Badge>
            ) : persisted ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                <SaveIcon className="size-3" />
                이력 저장됨
              </Badge>
            ) : persistError ? (
              <Badge variant="destructive" className="gap-1">
                저장 실패: {persistError}
              </Badge>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={submitting}
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

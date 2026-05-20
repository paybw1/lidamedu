// feat-3-301 / feat-4-A-114 연계 — 1차 진도별 모의고사 팩의 정오문제(OX) 시험 모드.
// 같은 팩(mcq_packs.kind=mock_progressive)을 객관식이 아니라 OX 지문 시험으로 풀이.
// 데이터 소스: 팩 문제들의 problem_choices · problem_box_items 중 OX 가능 지문.
//
// 모드 — ?mode=exam (기본, 이력 저장 + 일괄 제출 채점 + 타이머) vs ?mode=study (즉시 정답 표시 + 이력 미저장).
// 셔플 — 화면 내 토글. 셔플 ON 이면 지문 무작위 순. 다시 풀기 시 같은 순서 유지.
// 타이머 — exam 모드에서 pack.durationMin 이 있을 때 카운트다운. 0 도달 시 자동 제출.

import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  ShuffleIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  // OX 시험은 객관식 보기에서 추출되므로 모든 객관식 팩(mock_*, past_exam)에서 허용
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
  // 모든 객관식 팩(mock_*, past_exam)에서 OX 시험 가능 — 보기·박스 항목의 OX 지문 활용
  if (!pack.isPublished) {
    throw data("Forbidden", { status: 403 });
  }
  // feat-8-008 area_mock_exams 게이트 — mockKind 일 때만 (past_exam 은 별도 게이트 또는 무게이트)
  if (isMockKind(pack.kind)) {
    await requireFeature(client, user.id, "area_mock_exams");
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode: "exam" | "study" = modeParam === "study" ? "study" : "exam";

  const items = await getOxQuestionsForPack(client, params.packId);
  return { pack, items, mode };
}

export default function McqPackOxExam({ loaderData }: Route.ComponentProps) {
  const { pack, items, mode } = loaderData;
  const modeLabel = mode === "study" ? "학습" : "시험";
  const desc =
    mode === "study"
      ? `팩의 ${pack.problemCount}개 문제에서 추출된 ${items.length}개 OX 지문. 답을 누르면 즉시 정답·해설이 표시됩니다. 응시 이력은 저장되지 않습니다.`
      : `팩의 ${pack.problemCount}개 문제에서 추출된 ${items.length}개 OX 지문. 모두 풀고 제출하면 채점 결과를 표시하고 응시 이력에 저장합니다.`;
  return (
    <McqAreaShell
      isMock
      width="feed"
      backLink={{
        to: `/latest/mcq/${pack.packId}`,
        label: "팩 상세로",
      }}
      title={`${pack.title} — 정오문제 ${modeLabel}`}
      desc={desc}
    >
      {items.length === 0 ? (
        <EmptyState packId={pack.packId} />
      ) : (
        <ExamRunner
          packId={pack.packId}
          items={items}
          mode={mode}
          durationMin={pack.durationMin}
        />
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

// Fisher-Yates 셔플 — 의도적으로 시드 미고정(누를 때마다 다른 순서).
function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtMmSs(sec: number): string {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ExamRunner({
  packId,
  items,
  mode,
  durationMin,
}: {
  packId: string;
  items: OxQuestionItem[];
  mode: "exam" | "study";
  durationMin: number | null;
}) {
  const isStudy = mode === "study";

  // 카드별 인덱스 기준 상태(셔플과 무관, items 의 자연 인덱스)
  const [answers, setAnswers] = useState<Answer[]>(() => items.map(() => null));
  // study 모드 — 카드별로 답 누르면 그 카드만 즉시 노출
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    items.map(() => false),
  );
  // exam 모드 — 일괄 제출 후 전체 채점
  const [submitted, setSubmitted] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());

  // 셔플
  const [shuffleOn, setShuffleOn] = useState(false);
  const [order, setOrder] = useState<number[]>(() =>
    items.map((_, i) => i),
  );

  // exam 타이머
  const timeLimitSec =
    !isStudy && durationMin && durationMin > 0 ? durationMin * 60 : null;
  const [elapsedSec, setElapsedSec] = useState(0);
  const remainingSec =
    timeLimitSec !== null ? Math.max(0, timeLimitSec - elapsedSec) : null;
  const timeUp = timeLimitSec !== null && elapsedSec >= timeLimitSec;

  const fetcher = useFetcher<SubmitResponse>();
  const submitting = fetcher.state !== "idle";
  const persisted = fetcher.data && fetcher.data.ok ? fetcher.data : null;
  const persistError =
    fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  const answered = useMemo(
    () => answers.filter((a) => a !== null).length,
    [answers],
  );
  const revealedCount = useMemo(
    () => revealed.filter(Boolean).length,
    [revealed],
  );
  const studyCorrect = useMemo(() => {
    if (!isStudy) return 0;
    let c = 0;
    items.forEach((it, i) => {
      if (revealed[i] && answers[i] === it.oxTruth) c++;
    });
    return c;
  }, [isStudy, items, revealed, answers]);

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

  const handleSubmit = useCallback(() => {
    if (submitting || submitted) return;
    if (answered < items.length) {
      const ok = window.confirm(
        `${items.length - answered}개 미응답 지문이 있습니다. 그대로 제출할까요?`,
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
  }, [submitting, submitted, answered, items, answers, fetcher, startedAtMs]);

  // 타이머 tick — exam 모드 + 시간 제한 + 미제출.
  useEffect(() => {
    if (timeLimitSec === null) return;
    if (submitted) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timeLimitSec, submitted]);

  // 시간 종료 시 자동 제출.
  useEffect(() => {
    if (timeUp && !submitted && !submitting) {
      handleSubmit();
    }
  }, [timeUp, submitted, submitting, handleSubmit]);

  function setAt(i: number, v: OxTruth) {
    if (isStudy) {
      if (revealed[i]) return; // study 모드: 한 번 답한 카드는 잠금
      setAnswers((prev) => {
        const next = [...prev];
        next[i] = v;
        return next;
      });
      setRevealed((prev) => {
        const next = [...prev];
        next[i] = true;
        return next;
      });
      return;
    }
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function handleRetry() {
    setAnswers(items.map(() => null));
    setRevealed(items.map(() => false));
    setSubmitted(false);
    setElapsedSec(0);
    setStartedAtMs(Date.now());
    // 셔플 ON 이면 새로 섞고, OFF 면 자연 순서로 리셋.
    setOrder(shuffleOn ? shuffleIndices(items.length) : items.map((_, i) => i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleShuffle() {
    setShuffleOn((on) => {
      const next = !on;
      // 셔플 토글 시 즉시 순서 갱신. 진행 중 답은 인덱스에 묶여 있어 그대로 유지.
      setOrder(next ? shuffleIndices(items.length) : items.map((_, i) => i));
      return next;
    });
  }

  // exam 모드의 timer 색상.
  const timerWarn =
    timeLimitSec !== null && remainingSec !== null && remainingSec <= 60;
  const timerCrit =
    timeLimitSec !== null && remainingSec !== null && remainingSec <= 10;

  return (
    <div className="space-y-3">
      {/* 모드·옵션 행 — 모드 토글 + 셔플 + (필요 시) 타이머 */}
      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs">
        <Badge variant="outline" className="gap-1">
          {isStudy ? (
            <>
              <BookOpenIcon className="size-3" />
              학습 모드
            </>
          ) : (
            <>
              <CheckCircle2Icon className="size-3" />
              시험 모드
            </>
          )}
        </Badge>
        <Link
          to={`/latest/mcq/${packId}/ox-exam${isStudy ? "" : "?mode=study"}`}
          className="text-primary hover:underline"
        >
          → {isStudy ? "시험 모드로 전환" : "학습 모드로 전환"}
        </Link>
        <span className="text-muted-foreground/60">·</span>
        <Button
          type="button"
          size="sm"
          variant={shuffleOn ? "default" : "outline"}
          onClick={toggleShuffle}
          disabled={submitted}
          className="h-7 rounded-full px-2.5"
        >
          <ShuffleIcon className="size-3" />
          {shuffleOn ? "셔플 ON" : "셔플 OFF"}
        </Button>
        {timeLimitSec !== null && !submitted ? (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 tabular-nums font-mono font-bold",
              timerCrit
                ? "text-rose-600"
                : timerWarn
                  ? "text-amber-600"
                  : "text-foreground",
            )}
          >
            <ClockIcon className="size-3.5" />
            {fmtMmSs(remainingSec ?? 0)}
          </span>
        ) : null}
      </div>

      {/* 진행 상태 / 결과 카드 */}
      <header
        className={cn(
          "border-border sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur",
        )}
      >
        {isStudy ? (
          // study 모드 — 일괄 제출 없음, 진행률만 표시.
          <>
            <p className="text-foreground text-sm font-semibold">
              학습 진행{" "}
              <span className="tabular-nums">
                {revealedCount}/{items.length}
              </span>
            </p>
            <div className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{
                  width: `${(revealedCount / Math.max(items.length, 1)) * 100}%`,
                }}
              />
            </div>
            {revealedCount > 0 ? (
              <Badge variant="outline" className="tabular-nums">
                정답 {studyCorrect}/{revealedCount}
              </Badge>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              className="rounded-full"
            >
              <RotateCcwIcon className="size-3.5" /> 처음부터
            </Button>
          </>
        ) : !submitted ? (
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
            {timeUp ? (
              <Badge variant="destructive" className="gap-1">
                <ClockIcon className="size-3" />
                시간 종료 자동 제출
              </Badge>
            ) : null}
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

      {/* 지문 list — order 순서로 표시. answer/revealed 는 자연 인덱스 i 기준 */}
      <ol className="space-y-2.5">
        {order.map((i, displayIdx) => {
          const it = items[i];
          if (!it) return null;
          const cardSubmitted = isStudy ? revealed[i] : submitted;
          return (
            <li key={`${it.refType}:${it.refId}`}>
              <QuestionCard
                item={it}
                index={displayIdx + 1}
                answer={answers[i]}
                submitted={cardSubmitted}
                onAnswer={(v) => setAt(i, v)}
              />
            </li>
          );
        })}
      </ol>

      {!isStudy && !submitted && (
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

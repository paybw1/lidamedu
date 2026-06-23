// feat-3-301 / feat-4-A-114 연계 — 1차 진도별 모의고사 팩의 정오문제(OX) 시험 모드.
// 같은 팩(mcq_packs.kind=mock_progressive)을 객관식이 아니라 OX 지문 시험으로 풀이.
// 데이터 소스: 팩 문제들의 problem_choices · problem_box_items 중 OX 가능 지문.
//
// 모드 — ?mode=exam (기본, 회차 이력 저장 + 일괄 제출 채점 + 타이머) vs ?mode=study (즉시 정답 표시).
//   study 모드도 지문별 정오를 분석 데이터로 기록한다(/api/problems/attempt, mode='study', 세션 미생성).
//   응시 "회차"(quiz_sessions)는 exam 모드에서만 생성된다.
// 셔플 — 화면 내 토글. 셔플 ON 이면 지문 무작위 순. 다시 풀기 시 같은 순서 유지.
// 타이머 — exam 모드에서 pack.durationMin 이 있을 때 카운트다운. 0 도달 시 자동 제출.
import type { Route } from "./+types/mcq-pack-ox-exam";

import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  ShuffleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { McqAreaShell } from "~/features/mcq-packs/components/mcq-area-shell";
import { isMockKind } from "~/features/mcq-packs/labels";
import { getPackById } from "~/features/mcq-packs/queries.server";
import {
  type Answer,
  QuestionCard,
} from "~/features/problems/components/ox-question-card";
import type { OxQuestionItem, OxTruth } from "~/features/problems/labels";
import { getOxQuestionsForPack } from "~/features/problems/queries.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

// 클라는 응답만 보낸다(refType/refId/problemId/userAnswer). 정오 채점은 서버가
// 팩의 실제 ox_truth 로 재계산 — 클라가 보낸 정답/정오는 신뢰하지 않는다(서버 권위).
const submitItemSchema = z.object({
  refType: z.enum(["choice", "box"]),
  refId: z.string().uuid(),
  problemId: z.string().uuid(),
  userAnswer: z.enum(["O", "X"]).nullable(),
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

export async function action({ params, request }: Route.ActionArgs) {
  if (!params.packId)
    return data(
      { ok: false as const, error: "Missing packId" },
      { status: 400 },
    );
  if (request.method !== "POST")
    return data(
      { ok: false as const, error: "Method not allowed" },
      { status: 405 },
    );

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
      {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "입력 오류",
      },
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
      {
        ok: false as const,
        error: e instanceof Error ? e.message : "items 파싱 실패",
      },
      { status: 400 },
    );
  }
  if (items.length === 0) {
    return data(
      { ok: false as const, error: "응시 항목 없음" },
      { status: 400 },
    );
  }

  // pack 조회 — law_code 결정
  const pack = await getPackById(client, params.packId);
  if (!pack)
    return data(
      { ok: false as const, error: "Pack not found" },
      { status: 404 },
    );

  // 서버 권위 채점 — 팩의 실제 OX 정답(getOxQuestionsForPack, 러너 로더·결과 뷰와
  // 동일한 단일 소스)으로 재채점. truthMap 에 없는 ref(팩 편집·삭제 등)는 채점 불가 →
  // 저장·집계에서 제외(미응답처럼 흡수). 클라가 보낸 정오는 쓰지 않는다.
  const oxItems = await getOxQuestionsForPack(client, params.packId);
  const truthMap = new Map(
    oxItems.map((it) => [`${it.refType}:${it.refId}`, it.oxTruth] as const),
  );
  const graded = items.map((i) => {
    const truth = truthMap.get(`${i.refType}:${i.refId}`);
    return {
      ...i,
      gradeable: truth !== undefined,
      isCorrect:
        i.userAnswer !== null && truth !== undefined && i.userAnswer === truth,
    };
  });

  // session law_code/science_subject — 일반 객관식 응시(mcq-packs/api/start)와 동일하게
  // 팩 문제의 실제 law 로 결정(subject_scope 매핑 대신 — patent/design/trademark 누락
  // 버그 방지). quiz_sessions.subject_xor: law_code OR science_subject 중 하나 NOT NULL.
  const distinctProblemIds = [...new Set(items.map((i) => i.problemId))];
  const { data: firstRow } = await client
    .from("problems")
    .select("science_subject, laws(law_code)")
    .eq("problem_id", distinctProblemIds[0])
    .maybeSingle();
  const lawCode = firstRow?.laws?.law_code ?? null;
  const scienceSubject =
    (firstRow?.science_subject as
      | "physics"
      | "chemistry"
      | "biology"
      | "earth_science"
      | null) ?? null;
  if (!lawCode && !scienceSubject) {
    return data(
      {
        ok: false as const,
        error: "과목 식별 실패 (law_code/science_subject 모두 null)",
      },
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

  // 2) user_problem_attempts bulk — 응답 + 채점가능 ref 만, 서버 재채점 is_correct 저장.
  const perItemMs = Math.floor(
    parsed.data.durationMs / Math.max(items.length, 1),
  );
  const attempts = graded
    .filter((i) => i.userAnswer !== null && i.gradeable) // 미응답·채점불가 미저장
    .map((i) => ({
      user_id: user.id,
      problem_id: i.problemId,
      selected_choice_id: i.refType === "choice" ? i.refId : null,
      selected_box_item_id: i.refType === "box" ? i.refId : null,
      ox_answer: i.userAnswer as OxTruth,
      is_correct: i.isCorrect, // 서버 재채점 결과
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

  // 집계도 서버 채점 기준. 채점불가 응답은 정/오 어디에도 안 들어가 blank 로 흡수.
  const correct = graded.filter((i) => i.isCorrect).length;
  const wrong = graded.filter(
    (i) => i.gradeable && i.userAnswer !== null && !i.isCorrect,
  ).length;
  const blank = items.length - correct - wrong;
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
    {
      title: `${d.pack.title} — 정오문제 시험 | Lidam Patent Attorney Academy`,
    },
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
      ? `팩의 ${pack.problemCount}개 문제에서 추출된 ${items.length}개 정오문제 지문. 답을 누르면 즉시 정답·해설이 표시됩니다. 회차 이력에는 남지 않지만, 지문별 정오는 학습 분석에 반영됩니다.`
      : `팩의 ${pack.problemCount}개 문제에서 추출된 ${items.length}개 정오문제 지문. 모두 풀고 제출하면 채점 결과를 표시하고 응시 이력에 저장합니다.`;
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
        이 팩에 시험 가능한 정오문제 지문이 없습니다
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        팩 문제의 보기·박스 항목에 정답이 설정되어 있지 않거나, 모두 정오문제
        평가 부적합으로 표시되어 있습니다.
      </p>
      <Button asChild size="sm" className="mt-4">
        <Link to={`/latest/mcq/pack/${packId}`}>
          <ArrowLeftIcon className="size-3.5" /> 팩 상세로
        </Link>
      </Button>
    </div>
  );
}

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
  // ⑤' — study 모드 지문별 정오 기록. 카드가 동시에 보이므로(병렬 응답) 단일 fetcher 대신
  // ref 단위 독립 fetch(베스트-에포트). 같은 ref 중복 기록 방지용 가드. handleRetry 시 초기화.
  const recordedStudyRefs = useRef<Set<string>>(new Set());

  // 셔플
  const [shuffleOn, setShuffleOn] = useState(false);
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));

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
    // 서버가 재채점하므로 클라는 응답만 전송(oxTruth/isCorrect 미전송).
    const payload = items.map((it, i) => ({
      refType: it.refType,
      refId: it.refId,
      problemId: it.problemId,
      userAnswer: answers[i],
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

  // ⑤' — study 모드 1지문 응답을 분석 데이터로 기록. 패널(ox-questions-panel) 과 동일하게
  // /api/problems/attempt(mode='study') 사용 → user_problem_attempts 1행 + OX SRS 갱신.
  // quiz_sessions 는 만들지 않는다(회차 이력 미생성). 베스트-에포트(실패해도 풀이 흐름 방해 없음).
  function recordStudyAttempt(it: OxQuestionItem | undefined, v: OxTruth) {
    if (!it || recordedStudyRefs.current.has(it.refId)) return;
    recordedStudyRefs.current.add(it.refId);
    const fd = new FormData();
    fd.set("problemId", it.problemId);
    fd.set("oxAnswer", v);
    fd.set("isCorrect", v === it.oxTruth ? "true" : "false");
    fd.set("mode", "study");
    if (it.refType === "choice") fd.set("selectedChoiceId", it.refId);
    else fd.set("selectedBoxItemId", it.refId);
    void fetch("/api/problems/attempt", { method: "POST", body: fd }).catch(
      () => {
        // 실패 시 재기록 허용 — 가드 해제.
        recordedStudyRefs.current.delete(it.refId);
      },
    );
  }

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
      recordStudyAttempt(items[i], v);
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
    recordedStudyRefs.current.clear(); // 다시 풀기 → 재응답을 새 attempt 로 기록 허용
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
          className="text-link hover:underline"
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
              "ml-auto inline-flex items-center gap-1 font-mono font-bold tabular-nums",
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
          "border-border bg-card/95 sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur",
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
              <>
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                >
                  <SaveIcon className="size-3" />
                  이력 저장됨
                </Badge>
                <Link
                  to={`/me/ox-sessions/${persisted.sessionId}`}
                  className="text-link text-xs underline"
                >
                  결과 보기 →
                </Link>
              </>
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

// QuestionCard·OxButton 은 problems/components/ox-question-card 로 추출(결과 뷰 공용).

// feat-7-042 3단계 — 오프라인 채점 결과 입력 → 온라인 학습 신호 합류.
//
// 문항별 정오를 학생 명의의 quiz_session(scope_payload.source='offline_test') +
// user_problem_attempts(객관식·OX) / user_blank_attempts(빈칸) 로 기록해
// 약점 진단·마스터리·반 통계가 수정 없이 오프라인 결과를 포함하게 한다.
// 총점·응시 여부는 offline_test_results 에 스냅샷(표시용).
//
// ★adminClient 의도적 예외(feat-7-021b 원칙의 예외): 관리자가 학생 명의 기록을
// 쓰므로 RLS 우회가 불가피 — 호출측(API)이 ①staff ②반 소유권 ③대상 학생의
// 반 멤버십을 전부 재검증한 뒤에만 이 모듈을 호출해야 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllIn } from "~/core/lib/supa-batch.server";

import type { CohortOfflineTestStat } from "./labels";
import { getOfflineTestPrintData } from "./queries.server";

export interface OfflineResultRow {
  userId: string;
  status: "taken" | "absent";
  score: number | null;
  maxScore: number | null;
  wrongOrds: number[];
  takenAt: string | null;
  note: string | null;
  enteredAt: string;
}

export async function listOfflineTestResults(
  client: SupabaseClient<Database>,
  testId: string,
): Promise<OfflineResultRow[]> {
  const { data, error } = await client
    .from("offline_test_results")
    .select(
      "user_id, status, score, max_score, wrong_ords, taken_at, note, entered_at",
    )
    .eq("test_id", testId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    status: r.status as "taken" | "absent",
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
    wrongOrds: r.wrong_ords ?? [],
    takenAt: r.taken_at,
    note: r.note,
    enteredAt: r.entered_at,
  }));
}

// 4단계 — 반 단위 오프라인 테스트 통계 (반 통계 화면 카드용).
// 타입은 클라이언트 안전한 ./labels 가 SSOT.
export type { CohortOfflineTestStat } from "./labels";

export async function listCohortOfflineTestStats(
  client: SupabaseClient<Database>,
  cohortId: string,
  limit = 10,
): Promise<CohortOfflineTestStat[]> {
  const { data: tests, error } = await client
    .from("offline_tests")
    .select("test_id, assignment_id, title, law_code, science_subject, created_at")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = tests ?? [];
  if (list.length === 0) return [];

  const rows = await fetchAllIn(
    list.map((t) => t.test_id),
    (slice) =>
      client
        .from("offline_test_results")
        .select("test_id, status, score, max_score, result_id")
        .in("test_id", slice)
        .order("result_id"),
  );
  const byTest = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byTest.get(r.test_id) ?? [];
    arr.push(r);
    byTest.set(r.test_id, arr);
  }

  return list.map((t) => {
    const rs = byTest.get(t.test_id) ?? [];
    const taken = rs.filter((r) => r.status === "taken" && r.score !== null);
    const scores = taken.map((r) => Number(r.score));
    const maxScore = rs.find((r) => r.max_score !== null)?.max_score;
    const avg =
      scores.length > 0
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
        : null;
    return {
      testId: t.test_id,
      assignmentId: t.assignment_id,
      title: t.title,
      lawCode: t.law_code as CohortOfflineTestStat["lawCode"],
      scienceSubject: t.science_subject as CohortOfflineTestStat["scienceSubject"],
      createdAt: t.created_at,
      takenCount: taken.length,
      absentCount: rs.filter((r) => r.status === "absent").length,
      maxScore: maxScore == null ? null : Number(maxScore),
      avgScore: avg,
      avgPct:
        avg !== null && maxScore != null && Number(maxScore) > 0
          ? Math.round((avg / Number(maxScore)) * 100)
          : null,
      topScore: scores.length > 0 ? Math.max(...scores) : null,
      bottomScore: scores.length > 0 ? Math.min(...scores) : null,
    };
  });
}

// 학생 본인 — 과제에 붙은 오프라인 테스트 목록 + 내 결과 + 온라인 응시 가능 여부.
// 요청 클라이언트 RLS: offline_tests/questions 는 반 멤버 read, results 는 select_own.
export interface MyOfflineTest {
  testId: string;
  title: string;
  questionCount: number;
  // 온라인 응시 가능 = 객관식만으로 구성 (OX·빈칸 혼합은 지면 응시).
  allMcq: boolean;
  durationMin: number | null;
  result: {
    status: "taken" | "absent";
    score: number | null;
    maxScore: number | null;
    takenAt: string | null;
  } | null;
}

export async function listMyOfflineTestsForAssignment(
  client: SupabaseClient<Database>,
  userId: string,
  assignmentId: string,
): Promise<MyOfflineTest[]> {
  const { data: tests, error } = await client
    .from("offline_tests")
    .select("test_id, title, duration_min")
    .eq("assignment_id", assignmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const list = tests ?? [];
  if (list.length === 0) return [];
  const testIds = list.map((t) => t.test_id);

  const [{ data: results, error: rErr }, qRows] = await Promise.all([
    client
      .from("offline_test_results")
      .select("test_id, status, score, max_score, taken_at")
      .eq("user_id", userId)
      .in("test_id", testIds),
    fetchAllIn(testIds, (slice) =>
      client
        .from("offline_test_questions")
        .select("test_id, question_type, question_id")
        .in("test_id", slice)
        .order("question_id"),
    ),
  ]);
  if (rErr) throw rErr;
  const byTest = new Map((results ?? []).map((r) => [r.test_id, r]));
  const qByTest = new Map<string, { n: number; allMcq: boolean }>();
  for (const q of qRows) {
    const cur = qByTest.get(q.test_id) ?? { n: 0, allMcq: true };
    cur.n += 1;
    if (q.question_type !== "mcq") cur.allMcq = false;
    qByTest.set(q.test_id, cur);
  }

  return list.map((t) => {
    const r = byTest.get(t.test_id);
    const q = qByTest.get(t.test_id) ?? { n: 0, allMcq: false };
    return {
      testId: t.test_id,
      title: t.title,
      questionCount: q.n,
      allMcq: q.n > 0 && q.allMcq,
      durationMin: t.duration_min,
      result: r
        ? {
            status: r.status as "taken" | "absent",
            score: r.score === null ? null : Number(r.score),
            maxScore: r.max_score === null ? null : Number(r.max_score),
            takenAt: r.taken_at,
          }
        : null,
    };
  });
}

// ── 온라인 응시 결과 프리필 (결과 입력 그리드) ──────────────────────────────
// 학생이 온라인 응시(source='offline_test_online')한 완료 세션의 문항별 정오를
// 오답 ord 로 환산 — 운영자가 그리드에 불러와 검토 후 저장(스냅샷만, 시도 재기록 없음).
export interface OnlinePrefillEntry {
  userId: string;
  sessionId: string;
  wrongOrds: number[];
  completedAt: string;
}

export async function getOnlineSessionPrefill(
  admin: SupabaseClient<Database>,
  testId: string,
): Promise<OnlinePrefillEntry[]> {
  const { data: sessions, error } = await admin
    .from("quiz_sessions")
    .select("session_id, user_id, completed_at")
    .eq("scope_payload->>source", "offline_test_online")
    .eq("scope_payload->>testId", testId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  // 학생별 최신 완료 세션 1개.
  const latestByUser = new Map<string, { sessionId: string; completedAt: string }>();
  for (const s of sessions ?? []) {
    if (!latestByUser.has(s.user_id)) {
      latestByUser.set(s.user_id, {
        sessionId: s.session_id,
        completedAt: s.completed_at as string,
      });
    }
  }
  if (latestByUser.size === 0) return [];

  // 문항 ord ↔ 문제 매핑 (온라인 응시는 전부 객관식).
  const { data: qs, error: qErr } = await admin
    .from("offline_test_questions")
    .select("ord, problem_id")
    .eq("test_id", testId)
    .eq("question_type", "mcq")
    .order("ord");
  if (qErr) throw qErr;
  const ordByProblem = new Map(
    (qs ?? [])
      .filter((q) => q.problem_id)
      .map((q) => [q.problem_id as string, q.ord] as const),
  );
  const allOrds = (qs ?? []).map((q) => q.ord);

  const sessionIds = [...latestByUser.values()].map((v) => v.sessionId);
  const attempts = await fetchAllIn(sessionIds, (slice) =>
    admin
      .from("user_problem_attempts")
      .select("session_id, problem_id, is_correct, attempted_at")
      .in("session_id", slice)
      .order("attempted_at", { ascending: false }),
  );
  // 세션별 · 문제별 최신 시도.
  const latestBySessionProblem = new Map<string, boolean>();
  for (const a of attempts) {
    const key = `${a.session_id}:${a.problem_id}`;
    if (!latestBySessionProblem.has(key)) {
      latestBySessionProblem.set(key, a.is_correct);
    }
  }

  const out: OnlinePrefillEntry[] = [];
  for (const [userId, { sessionId, completedAt }] of latestByUser) {
    const wrong: number[] = [];
    for (const [problemId, ord] of ordByProblem) {
      const correct = latestBySessionProblem.get(`${sessionId}:${problemId}`);
      // 미응답도 오답 처리(시험 관행).
      if (correct !== true) wrong.push(ord);
    }
    // 전 문항 미응답(=사실상 미응시)은 프리필에서 제외.
    if (wrong.length >= allOrds.length && allOrds.length > 0) {
      const answered = [...ordByProblem].some(([pid]) =>
        latestBySessionProblem.has(`${sessionId}:${pid}`),
      );
      if (!answered) continue;
    }
    out.push({
      userId,
      sessionId,
      wrongOrds: wrong.sort((a, b) => a - b),
      completedAt,
    });
  }
  return out;
}

export interface OfflineResultEntry {
  userId: string;
  status: "taken" | "absent";
  wrongOrds: number[];
  // 온라인 응시 결과를 불러온 행 — 시도는 이미 학생 세션에 있으므로
  // 스냅샷(offline_test_results)만 기록하고 시도 재기록은 하지 않는다.
  onlineSessionId?: string | null;
}

export interface SaveOfflineResultsSummary {
  saved: number;
  absent: number;
}

export async function saveOfflineTestResults(
  admin: SupabaseClient<Database>,
  input: {
    testId: string;
    entries: OfflineResultEntry[];
    takenAt: string; // YYYY-MM-DD
    enteredBy: string;
  },
): Promise<SaveOfflineResultsSummary> {
  const test = await getOfflineTestPrintData(admin, input.testId);
  if (!test) throw new Error("테스트를 찾을 수 없습니다");
  const maxScore = test.totalPoints;
  const validOrds = new Set(test.questions.map((q) => q.ord));
  // 시험일 정오(KST) 시각으로 기록 — "가장 최근 시도" 규칙과 실제 응시일 정합.
  const attemptedAt = `${input.takenAt}T12:00:00+09:00`;

  // 문항 원본 참조가 필요 — print data 에는 ref id 가 없으므로 직접 조회.
  const { data: qRows, error: qErr } = await admin
    .from("offline_test_questions")
    .select(
      "ord, points, question_type, problem_id, ox_ref_type, ox_ref_id, ox_problem_id, blank_set_id",
    )
    .eq("test_id", input.testId)
    .order("ord");
  if (qErr) throw qErr;
  const questions = qRows ?? [];
  // 세션 problem_ids — 객관식 + OX 소속 문제 (빈칸은 조문 세트라 세션 밖).
  const problemIdsInTest = [
    ...new Set(
      questions.flatMap((q) =>
        [q.problem_id, q.ox_problem_id].filter((v): v is string => !!v),
      ),
    ),
  ];

  // 객관식 정답 선지(정답 처리 시 selected 로 기록) 일괄 조회.
  const mcqIds = questions
    .filter((q) => q.question_type === "mcq" && q.problem_id)
    .map((q) => q.problem_id as string);
  const correctChoiceByProblem = new Map<
    string,
    { choiceId: string; choiceIndex: number }
  >();
  if (mcqIds.length > 0) {
    const rows = await fetchAllIn(mcqIds, (slice) =>
      admin
        .from("problem_choices")
        .select("problem_id, choice_id, choice_index, is_correct")
        .in("problem_id", slice)
        .eq("is_correct", true)
        .order("choice_id"),
    );
    for (const r of rows) {
      if (!correctChoiceByProblem.has(r.problem_id)) {
        correctChoiceByProblem.set(r.problem_id, {
          choiceId: r.choice_id,
          choiceIndex: r.choice_index,
        });
      }
    }
  }

  // OX 진위 — 정오→응답값 계산용.
  const oxTruthByOrd = new Map<number, "O" | "X">();
  for (const q of test.questions) {
    if (q.questionType === "ox" && q.ox) oxTruthByOrd.set(q.ord, q.ox.truth);
  }

  // 빈칸 세트의 blank_idx 목록.
  const blankIdxsByOrd = new Map<number, number[]>();
  const blankAnswersByOrd = new Map<number, Map<number, string>>();
  for (const q of test.questions) {
    if (q.questionType === "blank" && q.blank) {
      blankIdxsByOrd.set(q.ord, q.blank.blanks.map((b) => b.idx));
      blankAnswersByOrd.set(
        q.ord,
        new Map(q.blank.blanks.map((b) => [b.idx, b.answer])),
      );
    }
  }

  // 기존 결과(세션 재사용) 로드. ★재사용·철회는 이 흐름이 만든 오프라인 세션
  // (source='offline_test')만 — 온라인 응시 세션은 학생의 실제 기록이라 건드리지 않는다.
  const { data: sessRows } = await admin
    .from("offline_test_results")
    .select("user_id, session_id")
    .eq("test_id", input.testId);
  const linkedSessionIds = (sessRows ?? [])
    .map((r) => r.session_id)
    .filter((v): v is string => !!v);
  const offlineSessionIds = new Set<string>();
  if (linkedSessionIds.length > 0) {
    const sess = await fetchAllIn(linkedSessionIds, (slice) =>
      admin
        .from("quiz_sessions")
        .select("session_id, scope_payload")
        .in("session_id", slice)
        .order("session_id"),
    );
    for (const s of sess) {
      const payload = s.scope_payload as { source?: string } | null;
      if (payload?.source === "offline_test") offlineSessionIds.add(s.session_id);
    }
  }
  const sessionByUser = new Map(
    (sessRows ?? [])
      .filter((r) => r.session_id && offlineSessionIds.has(r.session_id))
      .map((r) => [r.user_id, r.session_id as string] as const),
  );

  let saved = 0;
  let absent = 0;

  for (const entry of input.entries) {
    const wrongSet = new Set(entry.wrongOrds.filter((o) => validOrds.has(o)));
    let sessionId = sessionByUser.get(entry.userId) ?? null;

    // 온라인 응시 불러오기 행 — 스냅샷만 기록 (시도는 학생 세션에 이미 존재).
    if (entry.status === "taken" && entry.onlineSessionId) {
      let score = 0;
      for (const q of questions) {
        if (!wrongSet.has(q.ord)) score += Number(q.points ?? 0);
      }
      const { error: upErr } = await admin.from("offline_test_results").upsert(
        {
          test_id: input.testId,
          user_id: entry.userId,
          status: "taken",
          score,
          max_score: maxScore,
          wrong_ords: [...wrongSet].sort((a, b) => a - b),
          session_id: entry.onlineSessionId,
          taken_at: input.takenAt,
          entered_by: input.enteredBy,
          entered_at: new Date().toISOString(),
        },
        { onConflict: "test_id,user_id" },
      );
      if (upErr) throw upErr;
      saved++;
      continue;
    }

    if (entry.status === "absent") {
      // 이전에 taken 으로 기록했던 세션 시도는 철회.
      if (sessionId) {
        const { error } = await admin
          .from("user_problem_attempts")
          .delete()
          .eq("session_id", sessionId)
          .eq("user_id", entry.userId);
        if (error) throw error;
      }
      const { error: upErr } = await admin.from("offline_test_results").upsert(
        {
          test_id: input.testId,
          user_id: entry.userId,
          status: "absent",
          score: null,
          max_score: maxScore,
          wrong_ords: [],
          session_id: sessionId,
          taken_at: input.takenAt,
          entered_by: input.enteredBy,
          entered_at: new Date().toISOString(),
        },
        { onConflict: "test_id,user_id" },
      );
      if (upErr) throw upErr;
      absent++;
      continue;
    }

    // ── taken — 세션 확보(재사용) 후 시도 재기록 ──
    if (!sessionId) {
      const { data: sess, error: sErr } = await admin
        .from("quiz_sessions")
        .insert({
          user_id: entry.userId,
          mode: "exam",
          // 과목 XOR — quiz_sessions check 와 offline_tests check 가 동일 축.
          law_code: test.lawCode,
          science_subject: test.scienceSubject,
          scope_type: "filter",
          scope_payload: {
            source: "offline_test",
            testId: input.testId,
            title: test.title,
          },
          problem_ids: problemIdsInTest,
          time_limit_sec: null,
          started_at: attemptedAt,
        })
        .select("session_id")
        .single();
      if (sErr) throw sErr;
      sessionId = sess.session_id;
    } else {
      // 재입력 — 이전 오프라인 기록(이 세션의 시도)만 삭제 후 재기록.
      const { error } = await admin
        .from("user_problem_attempts")
        .delete()
        .eq("session_id", sessionId)
        .eq("user_id", entry.userId);
      if (error) throw error;
    }

    // 문항별 시도 기록.
    const attemptInserts: Database["public"]["Tables"]["user_problem_attempts"]["Insert"][] =
      [];
    const blankInserts: Database["public"]["Tables"]["user_blank_attempts"]["Insert"][] =
      [];
    let score = 0;
    for (const q of questions) {
      const correct = !wrongSet.has(q.ord);
      if (correct) score += Number(q.points ?? 0);

      if (q.question_type === "mcq" && q.problem_id) {
        const ans = correctChoiceByProblem.get(q.problem_id);
        attemptInserts.push({
          user_id: entry.userId,
          problem_id: q.problem_id,
          session_id: sessionId,
          is_correct: correct,
          // 정답 처리 시 정답 선지를 응답으로 기록(오프라인이라 실제 선택지는 모름).
          selected_choice_id: correct ? (ans?.choiceId ?? null) : null,
          selected_choice_index: correct ? (ans?.choiceIndex ?? null) : null,
          mode: "exam",
          attempted_at: attemptedAt,
        });
      } else if (q.question_type === "ox" && q.ox_problem_id && q.ox_ref_id) {
        const truth = oxTruthByOrd.get(q.ord) ?? "O";
        const answer: "O" | "X" = correct ? truth : truth === "O" ? "X" : "O";
        attemptInserts.push({
          user_id: entry.userId,
          problem_id: q.ox_problem_id,
          session_id: sessionId,
          is_correct: correct,
          ox_answer: answer,
          selected_choice_id: q.ox_ref_type === "choice" ? q.ox_ref_id : null,
          selected_box_item_id: q.ox_ref_type === "box" ? q.ox_ref_id : null,
          mode: "exam",
          attempted_at: attemptedAt,
        });
      } else if (q.question_type === "blank" && q.blank_set_id) {
        const idxs = blankIdxsByOrd.get(q.ord) ?? [];
        const answers = blankAnswersByOrd.get(q.ord);
        for (const idx of idxs) {
          blankInserts.push({
            user_id: entry.userId,
            set_id: q.blank_set_id,
            blank_idx: idx,
            is_correct: correct,
            user_input: correct ? (answers?.get(idx) ?? null) : null,
            attempted_at: attemptedAt,
          });
        }
      }
    }
    if (attemptInserts.length > 0) {
      const { error } = await admin
        .from("user_problem_attempts")
        .insert(attemptInserts);
      if (error) throw error;
    }
    if (blankInserts.length > 0) {
      // 빈칸은 세션 컬럼이 없어 append-only — "가장 최근 시도" 규칙이 흡수한다.
      const { error } = await admin
        .from("user_blank_attempts")
        .insert(blankInserts);
      if (error) throw error;
    }

    // 세션 점수 스냅샷(온라인 완료와 동일 필드) + 결과 upsert.
    const attemptTotal = attemptInserts.length;
    const attemptCorrect = attemptInserts.filter((a) => a.is_correct).length;
    const { error: sessUpErr } = await admin
      .from("quiz_sessions")
      .update({
        completed_at: new Date().toISOString(),
        score_correct: attemptCorrect,
        score_total: attemptTotal,
      })
      .eq("session_id", sessionId)
      .eq("user_id", entry.userId);
    if (sessUpErr) throw sessUpErr;

    const { error: upErr } = await admin.from("offline_test_results").upsert(
      {
        test_id: input.testId,
        user_id: entry.userId,
        status: "taken",
        score,
        max_score: maxScore,
        wrong_ords: [...wrongSet].sort((a, b) => a - b),
        session_id: sessionId,
        taken_at: input.takenAt,
        entered_by: input.enteredBy,
        entered_at: new Date().toISOString(),
      },
      { onConflict: "test_id,user_id" },
    );
    if (upErr) throw upErr;
    saved++;
  }

  return { saved, absent };
}

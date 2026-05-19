// 다과목 통합 1차 모의고사 (feat-10-005) 서버 쿼리.
// 시험 = 교시(mcq_packs) 묶음. 응시 = 교시별 quiz_sessions 묶음.
// RLS: 학생은 published 시험만 read + 본인 응시만 R/W, staff 는 전부.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  McqPackKind,
  McqPackSubjectScope,
} from "~/features/mcq-packs/labels";

import type {
  ExamAttemptBreakdown,
  ExamAttemptInfo,
  ExamAttemptRanking,
  ExamPaperScore,
  ExamPaperStatus,
  ExamRunnerData,
  ExamRunnerPaper,
  McqExamItem,
  McqExamPaper,
} from "./labels";

export type {
  ExamAttemptBreakdown,
  ExamAttemptInfo,
  ExamAttemptRanking,
  ExamPaperScore,
  ExamRunnerData,
  ExamRunnerPaper,
  McqExamItem,
  McqExamPaper,
} from "./labels";

const EXAM_COLUMNS =
  "exam_id, title, description, year, exam_round_no, pass_average, is_published, published_at, created_at, updated_at";

interface ExamRow {
  exam_id: string;
  title: string;
  description: string | null;
  year: number | null;
  exam_round_no: number | null;
  pass_average: number;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToExam(row: ExamRow, paperCount: number): McqExamItem {
  return {
    examId: row.exam_id,
    title: row.title,
    description: row.description,
    year: row.year,
    examRoundNo: row.exam_round_no,
    passAverage: row.pass_average,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paperCount,
  };
}

// ---- 시험 색인 / 조회 ----

export async function listExams(
  client: SupabaseClient<Database>,
): Promise<McqExamItem[]> {
  const { data, error } = await client
    .from("mcq_exams")
    .select(EXAM_COLUMNS)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as ExamRow[];
  if (rows.length === 0) return [];

  const { data: paperRows } = await client
    .from("mcq_exam_papers")
    .select("exam_id")
    .in(
      "exam_id",
      rows.map((r) => r.exam_id),
    );
  const countByExam = new Map<string, number>();
  for (const r of paperRows ?? []) {
    countByExam.set(r.exam_id, (countByExam.get(r.exam_id) ?? 0) + 1);
  }
  return rows.map((r) => rowToExam(r, countByExam.get(r.exam_id) ?? 0));
}

export async function getExamById(
  client: SupabaseClient<Database>,
  examId: string,
): Promise<McqExamItem | null> {
  const { data, error } = await client
    .from("mcq_exams")
    .select(EXAM_COLUMNS)
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("mcq_exam_papers")
    .select("pack_id", { count: "exact", head: true })
    .eq("exam_id", examId);
  return rowToExam(data as ExamRow, count ?? 0);
}

// 시험의 교시 목록 — ord 순. pack 정보(제목·과목·문항 수) 포함.
export async function getExamPapers(
  client: SupabaseClient<Database>,
  examId: string,
): Promise<McqExamPaper[]> {
  const { data, error } = await client
    .from("mcq_exam_papers")
    .select(
      "exam_id, pack_id, ord, fail_floor, mcq_packs!inner(title, subject_scope, kind, duration_min)",
    )
    .eq("exam_id", examId)
    .order("ord", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).filter((r) => r.mcq_packs !== null);
  if (rows.length === 0) return [];

  const packIds = rows.map((r) => r.pack_id);
  const { data: countRows } = await client
    .from("mcq_pack_problems")
    .select("pack_id")
    .in("pack_id", packIds);
  const countByPack = new Map<string, number>();
  for (const r of countRows ?? []) {
    countByPack.set(r.pack_id, (countByPack.get(r.pack_id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const pack = r.mcq_packs!;
    return {
      examId: r.exam_id,
      packId: r.pack_id,
      ord: r.ord,
      failFloor: r.fail_floor,
      packTitle: pack.title,
      subjectScope: pack.subject_scope as McqPackSubjectScope,
      kind: pack.kind as McqPackKind,
      durationMin: pack.duration_min,
      problemCount: countByPack.get(r.pack_id) ?? 0,
    };
  });
}

// ---- 시험 CRUD (staff) ----

export interface UpsertExamInput {
  title: string;
  description?: string | null;
  year?: number | null;
  examRoundNo?: number | null;
  passAverage: number;
  isPublished: boolean;
  publishedAt?: string | null;
}

export async function createExam(
  client: SupabaseClient<Database>,
  input: UpsertExamInput,
  authorId: string,
): Promise<{ ok: true; examId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("mcq_exams")
    .insert({
      title: input.title,
      description: input.description ?? null,
      year: input.year ?? null,
      exam_round_no: input.examRoundNo ?? null,
      pass_average: input.passAverage,
      is_published: input.isPublished,
      published_at: input.publishedAt ?? null,
      created_by: authorId,
    })
    .select("exam_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, examId: data.exam_id };
}

export async function updateExam(
  client: SupabaseClient<Database>,
  examId: string,
  patch: Partial<UpsertExamInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.year !== undefined) update.year = patch.year;
  if (patch.examRoundNo !== undefined) update.exam_round_no = patch.examRoundNo;
  if (patch.passAverage !== undefined) update.pass_average = patch.passAverage;
  if (patch.isPublished !== undefined) update.is_published = patch.isPublished;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("mcq_exams")
    .update(update)
    .eq("exam_id", examId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteExam(
  client: SupabaseClient<Database>,
  examId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("mcq_exams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("exam_id", examId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- 교시 매핑 (staff) ----

export async function addExamPaper(
  client: SupabaseClient<Database>,
  examId: string,
  packId: string,
  failFloor: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: maxRow } = await client
    .from("mcq_exam_papers")
    .select("ord")
    .eq("exam_id", examId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrd = (maxRow?.ord ?? -1) + 1;
  const { error } = await client.from("mcq_exam_papers").insert({
    exam_id: examId,
    pack_id: packId,
    ord: nextOrd,
    fail_floor: failFloor,
  });
  if (error) {
    if (error.code === "23505") return { ok: true }; // 이미 교시
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeExamPaper(
  client: SupabaseClient<Database>,
  examId: string,
  packId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("mcq_exam_papers")
    .delete()
    .eq("exam_id", examId)
    .eq("pack_id", packId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateExamPaper(
  client: SupabaseClient<Database>,
  examId: string,
  packId: string,
  patch: { ord?: number; failFloor?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.ord !== undefined) update.ord = patch.ord;
  if (patch.failFloor !== undefined) update.fail_floor = patch.failFloor;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("mcq_exam_papers")
    .update(update)
    .eq("exam_id", examId)
    .eq("pack_id", packId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- 응시 (mcq_exam_attempts) ----

export async function createExamAttempt(
  client: SupabaseClient<Database>,
  examId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await client
    .from("mcq_exam_attempts")
    .insert({ exam_id: examId, user_id: userId })
    .select("attempt_id")
    .single();
  if (error) throw error;
  return data.attempt_id;
}

function rowToAttempt(row: {
  attempt_id: string;
  exam_id: string;
  started_at: string;
  completed_at: string | null;
}): ExamAttemptInfo {
  return {
    attemptId: row.attempt_id,
    examId: row.exam_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function getLatestAttempt(
  client: SupabaseClient<Database>,
  examId: string,
  userId: string,
): Promise<ExamAttemptInfo | null> {
  const { data, error } = await client
    .from("mcq_exam_attempts")
    .select("attempt_id, exam_id, started_at, completed_at")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAttempt(data) : null;
}

export async function getAttemptById(
  client: SupabaseClient<Database>,
  attemptId: string,
  userId: string,
): Promise<ExamAttemptInfo | null> {
  const { data, error } = await client
    .from("mcq_exam_attempts")
    .select("attempt_id, exam_id, started_at, completed_at")
    .eq("attempt_id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAttempt(data) : null;
}

// 진행 중 응시의 교시 세션 — pack_id → {sessionId, completed}.
async function getAttemptSessions(
  client: SupabaseClient<Database>,
  attemptId: string,
): Promise<Map<string, { sessionId: string; completed: boolean }>> {
  const { data, error } = await client
    .from("quiz_sessions")
    .select("session_id, pack_id, completed_at")
    .eq("exam_attempt_id", attemptId);
  if (error) throw error;
  const map = new Map<string, { sessionId: string; completed: boolean }>();
  for (const s of data ?? []) {
    if (s.pack_id) {
      map.set(s.pack_id, {
        sessionId: s.session_id,
        completed: s.completed_at !== null,
      });
    }
  }
  return map;
}

// ---- 러너 (학생 응시 화면) ----

export async function getExamRunnerData(
  client: SupabaseClient<Database>,
  examId: string,
  userId: string,
): Promise<ExamRunnerData | null> {
  const exam = await getExamById(client, examId);
  if (!exam) return null;
  const papers = await getExamPapers(client, examId);
  const attempt = await getLatestAttempt(client, examId, userId);

  const sessionByPack = attempt
    ? await getAttemptSessions(client, attempt.attemptId)
    : new Map<string, { sessionId: string; completed: boolean }>();

  // 교시 게이트 — ord 순서대로, 이전 교시 완료해야 다음 교시 available.
  let priorAllDone = true;
  const runnerPapers: ExamRunnerPaper[] = papers.map((paper) => {
    const sess = sessionByPack.get(paper.packId);
    let status: ExamPaperStatus;
    if (sess?.completed) {
      status = "completed";
    } else if (sess) {
      status = "in_progress";
    } else if (priorAllDone) {
      status = "available";
    } else {
      status = "locked";
    }
    if (status !== "completed") priorAllDone = false;
    return { paper, status, sessionId: sess?.sessionId ?? null };
  });

  return { exam, papers: runnerPapers, attempt };
}

// ---- 교시 응시 시작 판정 (/api/mcq-pack/start 가 호출) ----

export type ExamPaperStartDecision =
  | { kind: "create" }
  | { kind: "resume"; sessionId: string }
  | { kind: "error"; message: string };

export async function getExamPaperStartDecision(
  client: SupabaseClient<Database>,
  userId: string,
  examAttemptId: string,
  packId: string,
): Promise<ExamPaperStartDecision> {
  const attempt = await getAttemptById(client, examAttemptId, userId);
  if (!attempt) {
    return { kind: "error", message: "응시 정보를 찾을 수 없습니다." };
  }
  if (attempt.completedAt) {
    return { kind: "error", message: "이미 종료된 응시입니다." };
  }

  const papers = await getExamPapers(client, attempt.examId);
  const target = papers.find((p) => p.packId === packId);
  if (!target) {
    return { kind: "error", message: "이 시험의 교시가 아닙니다." };
  }

  const sessionByPack = await getAttemptSessions(client, examAttemptId);
  const own = sessionByPack.get(packId);
  if (own?.completed) {
    return { kind: "error", message: "이미 완료한 교시입니다." };
  }
  if (own) {
    return { kind: "resume", sessionId: own.sessionId };
  }

  // 이전 교시(ord 작은 순)가 모두 완료돼야 시작 가능.
  for (const p of papers) {
    if (p.ord >= target.ord) break;
    if (!sessionByPack.get(p.packId)?.completed) {
      return { kind: "error", message: "이전 교시를 먼저 완료해야 합니다." };
    }
  }
  return { kind: "create" };
}

// ---- 응시 마무리 (session-complete 가 호출) ----

// 교시 세션 완료 시 호출 — 전 교시가 완료됐으면 attempt.completed_at 설정.
// 멱등 — 이미 완료된 응시는 그대로 둔다. examId 는 러너 redirect 용.
export async function finalizeExamAttemptIfComplete(
  client: SupabaseClient<Database>,
  attemptId: string,
): Promise<{ examId: string; completed: boolean } | null> {
  const { data: attempt, error } = await client
    .from("mcq_exam_attempts")
    .select("attempt_id, exam_id, completed_at")
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) return null;
  if (attempt.completed_at) {
    return { examId: attempt.exam_id, completed: true };
  }

  const { count: paperCount } = await client
    .from("mcq_exam_papers")
    .select("pack_id", { count: "exact", head: true })
    .eq("exam_id", attempt.exam_id);

  const { data: doneRows, error: dErr } = await client
    .from("quiz_sessions")
    .select("pack_id")
    .eq("exam_attempt_id", attemptId)
    .not("completed_at", "is", null);
  if (dErr) throw dErr;
  const donePacks = new Set<string>();
  for (const r of doneRows ?? []) {
    if (r.pack_id) donePacks.add(r.pack_id);
  }

  const total = paperCount ?? 0;
  if (total > 0 && donePacks.size >= total) {
    await client
      .from("mcq_exam_attempts")
      .update({ completed_at: new Date().toISOString() })
      .eq("attempt_id", attemptId)
      .is("completed_at", null);
    return { examId: attempt.exam_id, completed: true };
  }
  return { examId: attempt.exam_id, completed: false };
}

// ---- 결과 — 교시별 점수 + 합격 판정 (본인 데이터) ----

export async function getExamAttemptBreakdown(
  client: SupabaseClient<Database>,
  userId: string,
  attemptId: string,
): Promise<ExamAttemptBreakdown | null> {
  const attempt = await getAttemptById(client, attemptId, userId);
  if (!attempt) return null;
  const exam = await getExamById(client, attempt.examId);
  if (!exam) return null;
  const papers = await getExamPapers(client, attempt.examId);

  // 교시 세션 — pack_id → {sessionId, total}.
  const { data: sessRows, error: sErr } = await client
    .from("quiz_sessions")
    .select("session_id, pack_id, problem_ids")
    .eq("exam_attempt_id", attemptId);
  if (sErr) throw sErr;
  const sessByPack = new Map<string, { sessionId: string; total: number }>();
  const sessionIds: string[] = [];
  for (const s of sessRows ?? []) {
    if (!s.pack_id) continue;
    sessByPack.set(s.pack_id, {
      sessionId: s.session_id,
      total: s.problem_ids?.length ?? 0,
    });
    sessionIds.push(s.session_id);
  }

  // 세션별 정답 수 — 문제별 최신 시도 기준.
  const correctBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: attRows, error: aErr } = await client
      .from("user_problem_attempts")
      .select("session_id, problem_id, is_correct, attempted_at")
      .eq("user_id", userId)
      .in("session_id", sessionIds)
      .order("attempted_at", { ascending: false });
    if (aErr) throw aErr;
    const seen = new Set<string>();
    for (const r of attRows ?? []) {
      if (!r.session_id) continue;
      const key = `${r.session_id}:${r.problem_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.is_correct) {
        correctBySession.set(
          r.session_id,
          (correctBySession.get(r.session_id) ?? 0) + 1,
        );
      }
    }
  }

  const paperScores: ExamPaperScore[] = [];
  for (const paper of papers) {
    const sess = sessByPack.get(paper.packId);
    if (!sess) continue; // 미응시 교시 제외
    const correct = correctBySession.get(sess.sessionId) ?? 0;
    const total = sess.total;
    const score = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
    paperScores.push({
      packId: paper.packId,
      ord: paper.ord,
      packTitle: paper.packTitle,
      subjectScope: paper.subjectScope,
      failFloor: paper.failFloor,
      sessionId: sess.sessionId,
      correct,
      total,
      score,
      belowFloor: score < paper.failFloor,
    });
  }

  const average =
    paperScores.length > 0
      ? Math.round(
          (paperScores.reduce((a, p) => a + p.score, 0) / paperScores.length) *
            10,
        ) / 10
      : 0;
  const hasFloorFail = paperScores.some((p) => p.belowFloor);
  const passed =
    paperScores.length > 0
      ? average >= exam.passAverage && !hasFloorFail
      : null;

  return {
    attemptId: attempt.attemptId,
    examId: exam.examId,
    examTitle: exam.title,
    passAverage: exam.passAverage,
    completedAt: attempt.completedAt,
    papers: paperScores,
    average,
    hasFloorFail,
    passed,
  };
}

// ---- 등수 RPC 래퍼 ----

export async function getExamAttemptRanking(
  client: SupabaseClient<Database>,
  examId: string,
): Promise<ExamAttemptRanking | null> {
  const { data, error } = await client.rpc("mcq_exam_attempt_stats", {
    p_exam_id: examId,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    attemptId: row.attempt_id,
    average: row.average,
    rank: row.rank,
    totalTakers: row.total_takers,
    percentile: row.percentile,
    zScore: row.z_score,
  };
}

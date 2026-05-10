// 동료 채점(peer review) — 한 답안에 다수의 학생 reviewer 를 배정하고 채점 양식을 받는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type GsAttachment,
  listAnswersForSubmission,
  listGsQuestions,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";

export interface PeerAssignment {
  assignmentId: string;
  roundId: string;
  submissionId: string;
  reviewerUserId: string;
  assignedAt: string;
  submittedAt: string | null;
}

function mapAssignment(
  r: Database["public"]["Tables"]["gs_peer_assignments"]["Row"],
): PeerAssignment {
  return {
    assignmentId: r.assignment_id,
    roundId: r.round_id,
    submissionId: r.submission_id,
    reviewerUserId: r.reviewer_user_id,
    assignedAt: r.assigned_at,
    submittedAt: r.submitted_at,
  };
}

export interface PeerReviewAnswer {
  reviewAnswerId: string;
  assignmentId: string;
  questionId: string;
  score: number | null;
  feedbackMd: string | null;
  updatedAt: string;
}

function mapReviewAnswer(
  r: Database["public"]["Tables"]["gs_peer_review_answers"]["Row"],
): PeerReviewAnswer {
  return {
    reviewAnswerId: r.review_answer_id,
    assignmentId: r.assignment_id,
    questionId: r.question_id,
    score: r.score == null ? null : Number(r.score),
    feedbackMd: r.feedback_md,
    updatedAt: r.updated_at,
  };
}

// 운영자 — 한 회차의 모든 reviewer 배정 조회 (현황 매트릭스 용).
export async function listPeerAssignmentsForRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<PeerAssignment[]> {
  const { data, error } = await client
    .from("gs_peer_assignments")
    .select("*")
    .eq("round_id", roundId)
    .order("assigned_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAssignment);
}

// 운영자 — 셔플 + 균등 배정.
// 입력: 회차의 모든 제출(submissions) + 모든 reviewer 후보(보통 제출자 자신).
// 규칙:
//  - 제출자는 자기 답안을 채점하지 않음.
//  - 각 답안에 정확히 perSubmission 명의 reviewer 배정 (가능한 균등 분배).
//  - 이미 배정된 (submission, reviewer) 쌍은 보존(중복 방지).
//  - reviewer 후보가 perSubmission+1 명 미만이면 부족분만 배정 가능 (최대치).
export interface AssignmentResult {
  created: number;
  skipped: number;
  newAssignments: { reviewerUserId: string; assignmentId: string; roundId: string }[];
}

export async function assignPeerReviewers(
  client: SupabaseClient<Database>,
  roundId: string,
  perSubmission: number,
): Promise<AssignmentResult> {
  if (perSubmission < 1) return { created: 0, skipped: 0, newAssignments: [] };

  // 후보: 회차의 제출자(submitted) 학생 ID 들. 제출 안 한 학생은 제외 — 채점 부담 형평.
  const submissions = await listGsSubmissionsForRound(client, roundId);
  const submitted = submissions.filter((s) => s.submittedAt != null);
  const reviewerPool = submitted.map((s) => s.userId);

  if (submitted.length === 0)
    return { created: 0, skipped: 0, newAssignments: [] };

  const existing = await listPeerAssignmentsForRound(client, roundId);
  const existingByPair = new Set(
    existing.map((a) => `${a.submissionId}:${a.reviewerUserId}`),
  );
  // 학생별 채점 부담 (이미 배정된 수) — 균등 분배에 활용.
  const loadByReviewer = new Map<string, number>();
  for (const r of reviewerPool) loadByReviewer.set(r, 0);
  for (const a of existing) {
    loadByReviewer.set(
      a.reviewerUserId,
      (loadByReviewer.get(a.reviewerUserId) ?? 0) + 1,
    );
  }

  const inserts: { round_id: string; submission_id: string; reviewer_user_id: string }[] = [];
  let skipped = 0;

  for (const sub of submitted) {
    const already = existing.filter((a) => a.submissionId === sub.submissionId).length;
    const need = Math.max(0, perSubmission - already);
    if (need === 0) {
      skipped += 1;
      continue;
    }
    // 자기 자신 제외 + 이미 배정된 쌍 제외 → 부담 적은 순으로 정렬 → 셔플 tiebreak.
    const candidates = reviewerPool
      .filter((r) => r !== sub.userId)
      .filter((r) => !existingByPair.has(`${sub.submissionId}:${r}`));
    candidates.sort((a, b) => {
      const la = loadByReviewer.get(a) ?? 0;
      const lb = loadByReviewer.get(b) ?? 0;
      if (la !== lb) return la - lb;
      return Math.random() - 0.5;
    });
    const pick = candidates.slice(0, need);
    for (const r of pick) {
      inserts.push({
        round_id: roundId,
        submission_id: sub.submissionId,
        reviewer_user_id: r,
      });
      loadByReviewer.set(r, (loadByReviewer.get(r) ?? 0) + 1);
      existingByPair.add(`${sub.submissionId}:${r}`);
    }
  }

  if (inserts.length === 0)
    return { created: 0, skipped, newAssignments: [] };

  const { data: insertedRows, error } = await client
    .from("gs_peer_assignments")
    .insert(inserts)
    .select("assignment_id, reviewer_user_id, round_id");
  if (error) throw error;
  return {
    created: insertedRows?.length ?? inserts.length,
    skipped,
    newAssignments: (insertedRows ?? []).map((r) => ({
      assignmentId: r.assignment_id,
      reviewerUserId: r.reviewer_user_id,
      roundId: r.round_id,
    })),
  };
}

// 학생 — 본인이 reviewer 인 배정 목록 (라운드 메타 + 진행 상태 포함).
export interface OwnPeerAssignmentRow extends PeerAssignment {
  roundTitle: string;
  roundSubject: string;
  roundEndAt: string;
  questionsTotal: number;
  questionsScored: number;
}

export async function listOwnPeerAssignments(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<OwnPeerAssignmentRow[]> {
  const { data, error } = await client
    .from("gs_peer_assignments")
    .select("*, gs_rounds!inner(title, subject, end_at)")
    .eq("reviewer_user_id", userId)
    .order("assigned_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 진행도 — 각 assignment 의 review answer score 입력 여부.
  const ids = rows.map((r) => r.assignment_id);
  const { data: ra } = await client
    .from("gs_peer_review_answers")
    .select("assignment_id, score")
    .in("assignment_id", ids);
  const scoredByAssign = new Map<string, number>();
  for (const r of ra ?? []) {
    if (r.score != null) {
      scoredByAssign.set(r.assignment_id, (scoredByAssign.get(r.assignment_id) ?? 0) + 1);
    }
  }

  // 라운드별 문항 수 한 번에.
  const roundIds = Array.from(new Set(rows.map((r) => r.round_id)));
  const { data: qs } = await client
    .from("gs_questions")
    .select("question_id, round_id")
    .in("round_id", roundIds);
  const questionsByRound = new Map<string, number>();
  for (const q of qs ?? []) {
    questionsByRound.set(q.round_id, (questionsByRound.get(q.round_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...mapAssignment(r),
    roundTitle: r.gs_rounds.title,
    roundSubject: r.gs_rounds.subject,
    roundEndAt: r.gs_rounds.end_at,
    questionsTotal: questionsByRound.get(r.round_id) ?? 0,
    questionsScored: scoredByAssign.get(r.assignment_id) ?? 0,
  }));
}

// 학생 채점 화면 데이터 — assignment + 답안 첨부 + 본인이 작성한 review answer 들.
// 답안 작성자 ID 는 RLS 가 차단(본 함수는 staff/reviewer 만 호출). 학생에게 노출되는 응답에서는 user_id 제거.
export interface PeerReviewDetail {
  assignment: PeerAssignment;
  attachmentsByQuestion: Map<string, GsAttachment[]>;
  ocrTextByQuestion: Map<string, string>;
  myAnswers: Map<string, PeerReviewAnswer>;
}

export async function getPeerReviewDetail(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<PeerReviewDetail | null> {
  const { data: aRow } = await client
    .from("gs_peer_assignments")
    .select("*")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (!aRow) return null;
  const assignment = mapAssignment(aRow);

  const ans = await listAnswersForSubmission(client, assignment.submissionId);
  const attMap = new Map<string, GsAttachment[]>();
  const ocrMap = new Map<string, string>();
  for (const a of ans) {
    attMap.set(a.questionId, a.attachments);
    const ocr = a.attachments
      .map((x) => x.ocrText?.trim())
      .filter((s): s is string => !!s)
      .join("\n\n---\n\n");
    if (ocr) ocrMap.set(a.questionId, ocr);
  }

  const { data: rAns } = await client
    .from("gs_peer_review_answers")
    .select("*")
    .eq("assignment_id", assignmentId);
  const myAnswers = new Map<string, PeerReviewAnswer>();
  for (const r of rAns ?? []) myAnswers.set(r.question_id, mapReviewAnswer(r));

  return {
    assignment,
    attachmentsByQuestion: attMap,
    ocrTextByQuestion: ocrMap,
    myAnswers,
  };
}

export async function upsertPeerReviewAnswer(
  client: SupabaseClient<Database>,
  assignmentId: string,
  questionId: string,
  patch: { score?: number | null; feedbackMd?: string | null },
): Promise<void> {
  // assignment 가 본인 reviewer 인지 RLS 가 검증.
  const { data: existing } = await client
    .from("gs_peer_review_answers")
    .select("review_answer_id")
    .eq("assignment_id", assignmentId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (existing) {
    const upd: Record<string, unknown> = {};
    if (patch.score !== undefined) upd.score = patch.score;
    if (patch.feedbackMd !== undefined) upd.feedback_md = patch.feedbackMd;
    if (Object.keys(upd).length === 0) return;
    const { error } = await client
      .from("gs_peer_review_answers")
      .update(upd)
      .eq("review_answer_id", existing.review_answer_id);
    if (error) throw error;
  } else {
    const { error } = await client.from("gs_peer_review_answers").insert({
      assignment_id: assignmentId,
      question_id: questionId,
      score: patch.score ?? null,
      feedback_md: patch.feedbackMd ?? null,
    });
    if (error) throw error;
  }
}

export async function submitPeerReview(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_peer_assignments")
    .update({ submitted_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId);
  if (error) throw error;
}

// 운영자/학생 결과화면 — 한 제출에 도달한 모든 동료 채점 (제출 완료된 것만).
export interface PeerReviewForSubmission {
  assignmentId: string;
  reviewerUserId: string; // 학생 결과화면에서는 노출 금지 (loader 가 제거).
  submittedAt: string;
  answers: PeerReviewAnswer[];
}

export async function listPeerReviewsForSubmission(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<PeerReviewForSubmission[]> {
  const { data: assigns } = await client
    .from("gs_peer_assignments")
    .select("assignment_id, reviewer_user_id, submitted_at")
    .eq("submission_id", submissionId)
    .not("submitted_at", "is", null);
  if (!assigns || assigns.length === 0) return [];

  const ids = assigns.map((a) => a.assignment_id);
  const { data: rows } = await client
    .from("gs_peer_review_answers")
    .select("*")
    .in("assignment_id", ids);
  const byAssign = new Map<string, PeerReviewAnswer[]>();
  for (const r of rows ?? []) {
    const list = byAssign.get(r.assignment_id) ?? [];
    list.push(mapReviewAnswer(r));
    byAssign.set(r.assignment_id, list);
  }

  return assigns.map((a) => ({
    assignmentId: a.assignment_id,
    reviewerUserId: a.reviewer_user_id,
    submittedAt: a.submitted_at!,
    answers: byAssign.get(a.assignment_id) ?? [],
  }));
}

// 운영자 — 회차의 모든 동료 채점 점수를 (submission, question) 단위로 집계.
// 문항별 표준편차 등 분쟁 분석에 사용.
export interface PeerStdevRow {
  submissionId: string;
  questionId: string;
  scores: number[];
  count: number;
  avg: number;
  min: number;
  max: number;
  stdev: number;
}

export async function listPeerStdevForRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<PeerStdevRow[]> {
  const { data: submissions } = await client
    .from("gs_submissions")
    .select("submission_id, user_id")
    .eq("round_id", roundId)
    .not("submitted_at", "is", null);
  if (!submissions || submissions.length === 0) return [];
  const submissionIds = submissions.map((s) => s.submission_id);

  // 한 회차의 모든 (제출 완료된) reviewer 작성 점수를 한 쿼리로.
  const { data: rows } = await client
    .from("gs_peer_review_answers")
    .select(
      "score, question_id, gs_peer_assignments!inner(submission_id, submitted_at)",
    )
    .in("gs_peer_assignments.submission_id", submissionIds)
    .not("gs_peer_assignments.submitted_at", "is", null)
    .not("score", "is", null);
  if (!rows || rows.length === 0) return [];

  const buckets = new Map<string, { sub: string; q: string; s: number[] }>();
  for (const r of rows) {
    const sid = r.gs_peer_assignments.submission_id;
    const qid = r.question_id;
    const key = `${sid}:${qid}`;
    const cur = buckets.get(key) ?? { sub: sid, q: qid, s: [] };
    cur.s.push(Number(r.score));
    buckets.set(key, cur);
  }

  const out: PeerStdevRow[] = [];
  for (const v of buckets.values()) {
    if (v.s.length === 0) continue;
    const count = v.s.length;
    const avg = v.s.reduce((a, b) => a + b, 0) / count;
    const min = Math.min(...v.s);
    const max = Math.max(...v.s);
    const stdev =
      count >= 2
        ? Math.sqrt(
            v.s.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / count,
          )
        : 0;
    out.push({
      submissionId: v.sub,
      questionId: v.q,
      scores: v.s,
      count,
      avg: Math.round(avg * 100) / 100,
      min,
      max,
      stdev: Math.round(stdev * 100) / 100,
    });
  }
  return out;
}

// 운영자 — 배정 강제 삭제 (재배정 등).
export async function deletePeerAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_peer_assignments")
    .delete()
    .eq("assignment_id", assignmentId);
  if (error) throw error;
}

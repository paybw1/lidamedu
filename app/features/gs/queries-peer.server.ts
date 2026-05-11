// 동료 채점(peer review) — 한 답안에 다수의 학생 reviewer 를 배정하고 채점 양식을 받는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import {
  type GsPage,
  type GsQuestion,
  type RubricScores,
  listGsQuestions,
  listGsSubmissionsForRound,
  listSubmissionPages,
} from "~/features/gs/queries.server";

function parseRubricScoresSafe(raw: unknown): RubricScores {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RubricScores = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.score !== "number") continue;
    out[k] = { score: o.score };
    if (typeof o.note === "string") out[k].note = o.note;
  }
  return out;
}

// rubric_scores 의 모든 criterion 점수 합산 — score 컬럼에 자동 채움(통계 일관성).
export function sumRubricScores(scores: RubricScores): number {
  let total = 0;
  for (const v of Object.values(scores)) total += v.score;
  return total;
}

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
  // score 는 rubric_scores 합으로 자동 채움. rubric 미사용 시(legacy) 수동 입력값.
  score: number | null;
  rubricScores: RubricScores;
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
    rubricScores: parseRubricScoresSafe(r.rubric_scores),
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

// 학생 채점 화면 데이터 — assignment + 답안지 페이지(문항별 매핑) + 본인이 작성한 review answer 들.
// 답안 작성자 ID 는 RLS 가 차단(본 함수는 staff/reviewer 만 호출). 학생에게 노출되는 응답에서는 user_id 제거.
export interface PeerReviewDetail {
  assignment: PeerAssignment;
  pagesByQuestion: Map<string, GsPage[]>; // 문항 → 매핑된 페이지(order_index 순).
  ocrTextByQuestion: Map<string, string>; // 매핑 페이지의 OCR 합본.
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

  const [pages, mappingsRes, rAnsRes] = await Promise.all([
    listSubmissionPages(client, assignment.submissionId),
    client
      .from("gs_question_pages")
      .select("question_id, page_number, order_index")
      .eq("submission_id", assignment.submissionId)
      .order("order_index", { ascending: true }),
    client
      .from("gs_peer_review_answers")
      .select("*")
      .eq("assignment_id", assignmentId),
  ]);

  const pageByNum = new Map<number, GsPage>();
  for (const p of pages) pageByNum.set(p.pageNumber, p);

  const pagesByQuestion = new Map<string, GsPage[]>();
  const ocrTextByQuestion = new Map<string, string>();
  for (const m of mappingsRes.data ?? []) {
    const p = pageByNum.get(m.page_number);
    if (!p) continue;
    const list = pagesByQuestion.get(m.question_id) ?? [];
    list.push(p);
    pagesByQuestion.set(m.question_id, list);
  }
  for (const [qid, list] of pagesByQuestion.entries()) {
    const ocr = list
      .map((x) => x.attachment.ocrText?.trim())
      .filter((s): s is string => !!s)
      .join("\n\n---\n\n");
    if (ocr) ocrTextByQuestion.set(qid, ocr);
  }

  const myAnswers = new Map<string, PeerReviewAnswer>();
  for (const r of rAnsRes.data ?? []) {
    myAnswers.set(r.question_id, mapReviewAnswer(r));
  }

  return {
    assignment,
    pagesByQuestion,
    ocrTextByQuestion,
    myAnswers,
  };
}

export async function upsertPeerReviewAnswer(
  client: SupabaseClient<Database>,
  assignmentId: string,
  questionId: string,
  patch: {
    score?: number | null;
    rubricScores?: RubricScores;
    feedbackMd?: string | null;
  },
): Promise<void> {
  // assignment 가 본인 reviewer 인지 RLS 가 검증.
  const { data: existing } = await client
    .from("gs_peer_review_answers")
    .select("review_answer_id, rubric_scores")
    .eq("assignment_id", assignmentId)
    .eq("question_id", questionId)
    .maybeSingle();

  // rubricScores 가 들어오면 합산값을 score 에 자동 반영.
  const effectiveScore =
    patch.rubricScores !== undefined
      ? sumRubricScores(patch.rubricScores)
      : patch.score;

  if (existing) {
    const upd: Record<string, unknown> = {};
    if (effectiveScore !== undefined) upd.score = effectiveScore;
    if (patch.rubricScores !== undefined)
      upd.rubric_scores = patch.rubricScores as unknown as Json;
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
      score: effectiveScore ?? null,
      rubric_scores:
        (patch.rubricScores ?? {}) as unknown as Json,
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

// 라운드 단위 matrix 채점 — 한 reviewer 에게 배정된 모든 답안을 한 화면에서 동시에 채점.
// 답안 N개를 컬럼으로, 문제·criterion 을 행으로 배치하는 표 UI 의 데이터 소스.
// PPT 6페이지("한 채점자에 5개 답안 배정") 와 동일 레이아웃.
export interface PeerRoundAnswerColumn {
  assignmentId: string;
  submissionId: string;
  submittedAt: string | null; // peer 의 채점 제출(submit) 시각.
  // 답안 작성자 정보(userId/이름) 는 익명성 유지 위해 노출 X.
  // 표시 라벨은 컬럼 인덱스(답안 1, 답안 2...) — 진입 화면에서 부여.
  pagesByQuestion: Record<string, GsPage[]>;
  ocrTextByQuestion: Record<string, string>;
  reviewAnswers: Record<string, PeerReviewAnswer>; // questionId → 본인이 입력한 채점.
}

export interface PeerRoundMatrix {
  questions: GsQuestion[];
  columns: PeerRoundAnswerColumn[];
}

export async function getPeerRoundMatrix(
  client: SupabaseClient<Database>,
  roundId: string,
  reviewerUserId: string,
): Promise<PeerRoundMatrix> {
  // 1) reviewer 본인의 라운드 내 모든 assignment.
  const { data: aRows, error: aErr } = await client
    .from("gs_peer_assignments")
    .select("*")
    .eq("round_id", roundId)
    .eq("reviewer_user_id", reviewerUserId)
    .order("assigned_at", { ascending: true });
  if (aErr) throw aErr;
  const assignments = (aRows ?? []).map(mapAssignment);

  // 2) 문항(라운드 공용).
  const questions = await listGsQuestions(client, roundId);
  if (assignments.length === 0) {
    return { questions, columns: [] };
  }

  // 3) 페이지(매핑 포함) — submission 단위로 listSubmissionPages 재사용.
  //    한 reviewer 의 배정 수가 보통 5건 안팎이라 N+1 부담 없음.
  const assignmentIds = assignments.map((a) => a.assignmentId);
  const pagesBySubmission = new Map<string, GsPage[]>();
  await Promise.all(
    assignments.map(async (a) => {
      const pages = await listSubmissionPages(client, a.submissionId);
      pagesBySubmission.set(a.submissionId, pages);
    }),
  );

  // question_id → page_number[] (order_index 순) 매핑.
  const { data: mappingRows } = await client
    .from("gs_question_pages")
    .select("submission_id, question_id, page_number, order_index")
    .in(
      "submission_id",
      Array.from(new Set(assignments.map((a) => a.submissionId))),
    )
    .order("order_index", { ascending: true });
  const mappingsBySub = new Map<string, Map<string, number[]>>();
  for (const m of mappingRows ?? []) {
    const inner = mappingsBySub.get(m.submission_id) ?? new Map();
    const list = inner.get(m.question_id) ?? [];
    list.push(m.page_number);
    inner.set(m.question_id, list);
    mappingsBySub.set(m.submission_id, inner);
  }

  // 본인 채점값.
  const { data: reviewRows } = await client
    .from("gs_peer_review_answers")
    .select("*")
    .in("assignment_id", assignmentIds);
  const reviewsByAssign = new Map<string, Map<string, PeerReviewAnswer>>();
  for (const r of reviewRows ?? []) {
    const mapped = mapReviewAnswer(r);
    const inner = reviewsByAssign.get(r.assignment_id) ?? new Map();
    inner.set(r.question_id, mapped);
    reviewsByAssign.set(r.assignment_id, inner);
  }

  const columns: PeerRoundAnswerColumn[] = assignments.map((a) => {
    const pages = pagesBySubmission.get(a.submissionId) ?? [];
    const pageByNum = new Map<number, GsPage>();
    for (const p of pages) pageByNum.set(p.pageNumber, p);
    const mappings = mappingsBySub.get(a.submissionId);
    const pagesByQuestion: Record<string, GsPage[]> = {};
    const ocrTextByQuestion: Record<string, string> = {};
    if (mappings) {
      for (const [qid, nums] of mappings.entries()) {
        const list: GsPage[] = [];
        for (const n of nums) {
          const p = pageByNum.get(n);
          if (p) list.push(p);
        }
        pagesByQuestion[qid] = list;
        const ocr = list
          .map((x) => x.attachment.ocrText?.trim())
          .filter((s): s is string => !!s)
          .join("\n\n---\n\n");
        if (ocr) ocrTextByQuestion[qid] = ocr;
      }
    }
    const reviewAnswers: Record<string, PeerReviewAnswer> = {};
    const inner = reviewsByAssign.get(a.assignmentId);
    if (inner) {
      for (const [qid, ans] of inner.entries()) reviewAnswers[qid] = ans;
    }
    return {
      assignmentId: a.assignmentId,
      submissionId: a.submissionId,
      submittedAt: a.submittedAt,
      pagesByQuestion,
      ocrTextByQuestion,
      reviewAnswers,
    };
  });

  return { questions, columns };
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

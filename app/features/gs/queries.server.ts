// 온라인 GS — 회차/문제/제출/답안 server queries.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type GsRoundStatus = "draft" | "published" | "closed";

export interface GsRound {
  roundId: string;
  title: string;
  subject: LawSubjectSlug;
  descriptionMd: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  status: GsRoundStatus;
  seriesId: string | null;
  roundNumber: number | null;
  paperPdfPath: string | null;
  answerKeyPdfPath: string | null;
  expectedPages: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GsSeries {
  seriesId: string;
  title: string;
  subject: LawSubjectSlug;
  descriptionMd: string | null;
  expectedRounds: number;
  createdAt: string;
  updatedAt: string;
}

export interface GsQuestion {
  questionId: string;
  roundId: string;
  orderIndex: number;
  title: string | null;
  bodyMd: string;
  modelAnswerMd: string | null;
  maxScore: number;
}

export interface GsSubmissionSummary {
  submissionId: string;
  roundId: string;
  userId: string;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number | null;
  gradedAt: string | null;
}

function mapRound(
  r: Database["public"]["Tables"]["gs_rounds"]["Row"],
): GsRound {
  return {
    roundId: r.round_id,
    title: r.title,
    subject: r.subject as LawSubjectSlug,
    descriptionMd: r.description_md,
    startAt: r.start_at,
    endAt: r.end_at,
    durationMin: r.duration_min,
    status: r.status as GsRoundStatus,
    seriesId: r.series_id,
    roundNumber: r.round_number,
    paperPdfPath: r.paper_pdf_path,
    answerKeyPdfPath: r.answer_key_pdf_path,
    expectedPages: r.expected_pages,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSeries(
  r: Database["public"]["Tables"]["gs_series"]["Row"],
): GsSeries {
  return {
    seriesId: r.series_id,
    title: r.title,
    subject: r.subject as LawSubjectSlug,
    descriptionMd: r.description_md,
    expectedRounds: r.expected_rounds,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 운영자: 모든 회차 (draft 포함).
export async function listAllGsRounds(
  client: SupabaseClient<Database>,
  filters: { subject?: LawSubjectSlug; status?: GsRoundStatus } = {},
): Promise<GsRound[]> {
  let q = client
    .from("gs_rounds")
    .select("*")
    .order("start_at", { ascending: false });
  if (filters.subject) q = q.eq("subject", filters.subject);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRound);
}

// 학생: 노출 가능한 회차 (published / closed). RLS 가 추가로 차단.
export async function listVisibleGsRounds(
  client: SupabaseClient<Database>,
  filters: { subject?: LawSubjectSlug } = {},
): Promise<GsRound[]> {
  let q = client
    .from("gs_rounds")
    .select("*")
    .in("status", ["published", "closed"])
    .order("start_at", { ascending: false });
  if (filters.subject) q = q.eq("subject", filters.subject);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRound);
}

export async function getGsRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<GsRound | null> {
  const { data, error } = await client
    .from("gs_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRound(data) : null;
}

export async function listGsQuestions(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<GsQuestion[]> {
  const { data, error } = await client
    .from("gs_questions")
    .select("*")
    .eq("round_id", roundId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    questionId: r.question_id,
    roundId: r.round_id,
    orderIndex: r.order_index,
    title: r.title,
    bodyMd: r.body_md,
    modelAnswerMd: r.model_answer_md,
    maxScore: r.max_score,
  }));
}

// 입력 제출 — 학생: 자기 제출만, 회차당 1개. 이미 있으면 그대로 반환.
export async function getOrCreateOwnSubmission(
  client: SupabaseClient<Database>,
  userId: string,
  roundId: string,
): Promise<GsSubmissionSummary> {
  const existing = await client
    .from("gs_submissions")
    .select("*")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data) return mapSubmission(existing.data);

  const { data, error } = await client
    .from("gs_submissions")
    .insert({ round_id: roundId, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return mapSubmission(data);
}

export async function getOwnSubmission(
  client: SupabaseClient<Database>,
  userId: string,
  roundId: string,
): Promise<GsSubmissionSummary | null> {
  const { data, error } = await client
    .from("gs_submissions")
    .select("*")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSubmission(data) : null;
}

export async function listOwnSubmissions(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<(GsSubmissionSummary & { round: GsRound })[]> {
  const { data, error } = await client
    .from("gs_submissions")
    .select("*, gs_rounds!inner(*)")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...mapSubmission(row),
    round: mapRound(row.gs_rounds),
  }));
}

function mapSubmission(
  r: Database["public"]["Tables"]["gs_submissions"]["Row"],
): GsSubmissionSummary {
  return {
    submissionId: r.submission_id,
    roundId: r.round_id,
    userId: r.user_id,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    totalScore: r.total_score == null ? null : Number(r.total_score),
    gradedAt: r.graded_at,
  };
}

// 운영자: 한 회차의 모든 제출 (응시 현황).
export async function listGsSubmissionsForRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<GsSubmissionSummary[]> {
  const { data, error } = await client
    .from("gs_submissions")
    .select("*")
    .eq("round_id", roundId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSubmission);
}

// 운영자: 회차 생성/수정/삭제.
export async function createGsRound(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    title: string;
    subject: LawSubjectSlug;
    descriptionMd: string | null;
    startAt: string;
    endAt: string;
    durationMin: number;
    status?: GsRoundStatus;
    seriesId?: string | null;
    roundNumber?: number | null;
    expectedPages?: number;
  },
): Promise<GsRound> {
  const { data, error } = await client
    .from("gs_rounds")
    .insert({
      title: input.title,
      subject: input.subject,
      description_md: input.descriptionMd,
      start_at: input.startAt,
      end_at: input.endAt,
      duration_min: input.durationMin,
      status: input.status ?? "draft",
      series_id: input.seriesId ?? null,
      round_number: input.roundNumber ?? null,
      expected_pages: input.expectedPages ?? 20,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRound(data);
}

// ---- 시험지·모범답안 PDF (회차 단위) ----

export type GsPaperKind = "paper" | "answer_key";

export async function setGsRoundPaperPath(
  client: SupabaseClient<Database>,
  roundId: string,
  kind: GsPaperKind,
  path: string | null,
): Promise<void> {
  const col = kind === "paper" ? "paper_pdf_path" : "answer_key_pdf_path";
  const { error } = await client
    .from("gs_rounds")
    .update({ [col]: path })
    .eq("round_id", roundId);
  if (error) throw error;
}

export async function getGsPaperSignedUrl(
  client: SupabaseClient<Database>,
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from("gs-papers")
    .createSignedUrl(path, expiresInSec, {
      download: path.split("/").pop() ?? "paper.pdf",
    });
  if (error) return null;
  return data?.signedUrl ?? null;
}

// 변리사 표준 4문제 (30·20·30·20점) 시드 — 회차에 문제가 0개일 때만 안전 동작.
export async function seedDefaultGsQuestions(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<{ seeded: number }> {
  const { data: existing } = await client
    .from("gs_questions")
    .select("question_id")
    .eq("round_id", roundId)
    .limit(1);
  if (existing && existing.length > 0) return { seeded: 0 };
  const seeds = [
    { order_index: 0, title: "문 1.", body_md: "(여기에 문 1 본문 입력)", max_score: 30 },
    { order_index: 1, title: "문 2.", body_md: "(여기에 문 2 본문 입력)", max_score: 20 },
    { order_index: 2, title: "문 3.", body_md: "(여기에 문 3 본문 입력)", max_score: 30 },
    { order_index: 3, title: "문 4.", body_md: "(여기에 문 4 본문 입력)", max_score: 20 },
  ];
  const { error } = await client
    .from("gs_questions")
    .insert(seeds.map((s) => ({ round_id: roundId, ...s })));
  if (error) throw error;
  return { seeded: 4 };
}

export async function updateGsRound(
  client: SupabaseClient<Database>,
  roundId: string,
  patch: Partial<{
    title: string;
    subject: LawSubjectSlug;
    descriptionMd: string | null;
    startAt: string;
    endAt: string;
    durationMin: number;
    status: GsRoundStatus;
    seriesId: string | null;
    roundNumber: number | null;
    expectedPages: number;
  }>,
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.subject !== undefined) upd.subject = patch.subject;
  if (patch.descriptionMd !== undefined) upd.description_md = patch.descriptionMd;
  if (patch.startAt !== undefined) upd.start_at = patch.startAt;
  if (patch.endAt !== undefined) upd.end_at = patch.endAt;
  if (patch.durationMin !== undefined) upd.duration_min = patch.durationMin;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.seriesId !== undefined) upd.series_id = patch.seriesId;
  if (patch.roundNumber !== undefined) upd.round_number = patch.roundNumber;
  if (patch.expectedPages !== undefined) upd.expected_pages = patch.expectedPages;
  if (Object.keys(upd).length === 0) return;
  const { error } = await client
    .from("gs_rounds")
    .update(upd)
    .eq("round_id", roundId);
  if (error) throw error;
}

// 시리즈 CRUD.
export async function listAllGsSeries(
  client: SupabaseClient<Database>,
): Promise<GsSeries[]> {
  const { data, error } = await client
    .from("gs_series")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSeries);
}

export async function getGsSeries(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<GsSeries | null> {
  const { data, error } = await client
    .from("gs_series")
    .select("*")
    .eq("series_id", seriesId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSeries(data) : null;
}

export async function createGsSeries(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    title: string;
    subject: LawSubjectSlug;
    descriptionMd: string | null;
    expectedRounds: number;
  },
): Promise<GsSeries> {
  const { data, error } = await client
    .from("gs_series")
    .insert({
      title: input.title,
      subject: input.subject,
      description_md: input.descriptionMd,
      expected_rounds: input.expectedRounds,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSeries(data);
}

export async function updateGsSeries(
  client: SupabaseClient<Database>,
  seriesId: string,
  patch: Partial<{
    title: string;
    subject: LawSubjectSlug;
    descriptionMd: string | null;
    expectedRounds: number;
  }>,
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.subject !== undefined) upd.subject = patch.subject;
  if (patch.descriptionMd !== undefined) upd.description_md = patch.descriptionMd;
  if (patch.expectedRounds !== undefined)
    upd.expected_rounds = patch.expectedRounds;
  if (Object.keys(upd).length === 0) return;
  const { error } = await client
    .from("gs_series")
    .update(upd)
    .eq("series_id", seriesId);
  if (error) throw error;
}

export async function deleteGsSeries(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<void> {
  // 회차들은 series_id NULL 로 detach (round 자체는 보존).
  await client
    .from("gs_rounds")
    .update({ series_id: null, round_number: null })
    .eq("series_id", seriesId);
  const { error } = await client
    .from("gs_series")
    .delete()
    .eq("series_id", seriesId);
  if (error) throw error;
}

export async function listRoundsForSeries(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<GsRound[]> {
  const { data, error } = await client
    .from("gs_rounds")
    .select("*")
    .eq("series_id", seriesId)
    .order("round_number", { ascending: true })
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRound);
}

// ---- 통계 RPC wrapper ----

export interface RoundStudentStat {
  userId: string;
  userName: string | null;
  totalScore: number;
  rank: number;
  zScore: number;
  percentile: number;
  gradedCount: number;
}

export async function getRoundStudentStats(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<RoundStudentStat[]> {
  const { data, error } = await client.rpc("gs_round_student_stats", {
    p_round_id: roundId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    totalScore: Number(r.total_score),
    rank: r.rank,
    zScore: Number(r.z_score ?? 0),
    percentile: Number(r.percentile ?? 0),
    gradedCount: Number(r.graded_count ?? 0),
  }));
}

export interface RoundQuestionStat {
  questionId: string;
  orderIndex: number;
  title: string | null;
  maxScore: number;
  n: number;
  avg: number;
  median: number;
  stdev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

export async function getRoundQuestionStats(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<RoundQuestionStat[]> {
  const { data, error } = await client.rpc("gs_round_question_stats", {
    p_round_id: roundId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    questionId: r.question_id,
    orderIndex: r.order_index,
    title: r.title,
    maxScore: r.max_score,
    n: Number(r.n ?? 0),
    avg: Number(r.avg_score ?? 0),
    median: Number(r.median_score ?? 0),
    stdev: Number(r.stdev ?? 0),
    min: Number(r.min_score ?? 0),
    max: Number(r.max_actual ?? 0),
    q1: Number(r.q1 ?? 0),
    q3: Number(r.q3 ?? 0),
  }));
}

export interface SeriesStudentStat {
  userId: string;
  userName: string | null;
  roundsTaken: number;
  avgTotal: number;
  avgZScore: number;
  seriesRank: number;
}

export async function getSeriesStudentStats(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesStudentStat[]> {
  const { data, error } = await client.rpc("gs_series_student_stats", {
    p_series_id: seriesId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    roundsTaken: Number(r.rounds_taken ?? 0),
    avgTotal: Number(r.avg_total ?? 0),
    avgZScore: Number(r.avg_z_score ?? 0),
    seriesRank: r.series_rank,
  }));
}

export interface SeriesRoundSummary {
  roundId: string;
  roundNumber: number | null;
  title: string;
  startAt: string;
  n: number;
  avgTotal: number;
  stdev: number;
  maxTotal: number;
  minTotal: number;
}

export async function getSeriesRoundSummary(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesRoundSummary[]> {
  const { data, error } = await client.rpc("gs_series_round_summary", {
    p_series_id: seriesId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    roundId: r.round_id,
    roundNumber: r.round_number,
    title: r.title,
    startAt: r.start_at,
    n: Number(r.n ?? 0),
    avgTotal: Number(r.avg_total ?? 0),
    stdev: Number(r.stdev ?? 0),
    maxTotal: Number(r.max_total ?? 0),
    minTotal: Number(r.min_total ?? 0),
  }));
}

export interface SeriesMatrixCell {
  userId: string;
  userName: string | null;
  roundId: string;
  roundNumber: number | null;
  totalScore: number;
  zScore: number;
}

// ---- 학생 본인 추이 (SECURITY DEFINER RPC) ----

export interface MyProgressRow {
  roundId: string;
  roundNumber: number | null;
  roundTitle: string;
  startAt: string;
  cohortN: number;
  cohortAvg: number;
  cohortStdev: number;
  myTotal: number;
  myZ: number;
  myRank: number;
  myPercentile: number;
}

export async function getMySeriesProgress(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<MyProgressRow[]> {
  const { data, error } = await client.rpc("gs_series_my_progress", {
    p_series_id: seriesId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    roundId: r.round_id,
    roundNumber: r.round_number,
    roundTitle: r.round_title,
    startAt: r.start_at,
    cohortN: Number(r.cohort_n ?? 0),
    cohortAvg: Number(r.cohort_avg ?? 0),
    cohortStdev: Number(r.cohort_stdev ?? 0),
    myTotal: Number(r.my_total ?? 0),
    myZ: Number(r.my_z ?? 0),
    myRank: Number(r.my_rank ?? 0),
    myPercentile: Number(r.my_percentile ?? 0),
  }));
}

export interface MySeriesSummary {
  roundsTaken: number;
  avgTotal: number;
  avgZ: number;
  seriesRank: number;
  totalStudents: number;
}

export async function getMySeriesSummary(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<MySeriesSummary | null> {
  const { data, error } = await client.rpc("gs_series_my_summary", {
    p_series_id: seriesId,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    roundsTaken: Number(row.rounds_taken ?? 0),
    avgTotal: Number(row.avg_total ?? 0),
    avgZ: Number(row.avg_z ?? 0),
    seriesRank: Number(row.series_rank ?? 0),
    totalStudents: Number(row.total_students ?? 0),
  };
}

export interface MySeriesListRow {
  seriesId: string;
  title: string;
  subject: LawSubjectSlug;
  expectedRounds: number;
  roundsTaken: number;
}

export async function listMySeries(
  client: SupabaseClient<Database>,
): Promise<MySeriesListRow[]> {
  const { data, error } = await client.rpc("gs_my_series_list");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    seriesId: r.series_id,
    title: r.title,
    subject: r.subject as LawSubjectSlug,
    expectedRounds: r.expected_rounds,
    roundsTaken: Number(r.rounds_taken ?? 0),
  }));
}

export async function getSeriesMatrix(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesMatrixCell[]> {
  const { data, error } = await client.rpc("gs_series_matrix", {
    p_series_id: seriesId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    roundId: r.round_id,
    roundNumber: r.round_number,
    totalScore: Number(r.total_score ?? 0),
    zScore: Number(r.z_score ?? 0),
  }));
}

export async function deleteGsRound(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_rounds")
    .delete()
    .eq("round_id", roundId);
  if (error) throw error;
}

// 운영자: 문제 추가/수정/삭제.
export async function upsertGsQuestion(
  client: SupabaseClient<Database>,
  input: {
    questionId?: string;
    roundId: string;
    orderIndex: number;
    title: string | null;
    bodyMd: string;
    modelAnswerMd: string | null;
    maxScore: number;
  },
): Promise<string> {
  if (input.questionId) {
    const { error } = await client
      .from("gs_questions")
      .update({
        order_index: input.orderIndex,
        title: input.title,
        body_md: input.bodyMd,
        model_answer_md: input.modelAnswerMd,
        max_score: input.maxScore,
      })
      .eq("question_id", input.questionId);
    if (error) throw error;
    return input.questionId;
  }
  const { data, error } = await client
    .from("gs_questions")
    .insert({
      round_id: input.roundId,
      order_index: input.orderIndex,
      title: input.title,
      body_md: input.bodyMd,
      model_answer_md: input.modelAnswerMd,
      max_score: input.maxScore,
    })
    .select("question_id")
    .single();
  if (error) throw error;
  return data.question_id;
}

export async function deleteGsQuestion(
  client: SupabaseClient<Database>,
  questionId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_questions")
    .delete()
    .eq("question_id", questionId);
  if (error) throw error;
}

// ---- 답안 + 첨부 ----

export interface GsAttachment {
  path: string; // storage key
  fileName: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  pageCount?: number;
  createdAt: string;
  // OCR 판독 검사 결과 (Google Vision). 미실행/실패 시 undefined.
  ocrText?: string;
  ocrCharCount?: number;
  ocrKoreanCharCount?: number;
  ocrConfidence?: number;
  ocrLevel?: "good" | "warn" | "bad";
  ocrCheckedAt?: string;
}

export interface GsAnswerRecord {
  answerId: string;
  submissionId: string;
  questionId: string;
  bodyMd: string;
  attachments: GsAttachment[];
  legibilityConfirmed: boolean;
  score: number | null;
  feedbackMd: string | null;
}

function mapAnswer(
  r: Database["public"]["Tables"]["gs_answers"]["Row"],
): GsAnswerRecord {
  return {
    answerId: r.answer_id,
    submissionId: r.submission_id,
    questionId: r.question_id,
    bodyMd: r.body_md,
    attachments: parseAttachments(r.attachments),
    legibilityConfirmed: r.legibility_confirmed,
    score: r.score == null ? null : Number(r.score),
    feedbackMd: r.feedback_md,
  };
}

function parseAttachment(raw: unknown): GsAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.path !== "string" || typeof o.fileName !== "string") return null;
  const att: GsAttachment = {
    path: o.path,
    fileName: o.fileName,
    mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
    size: typeof o.size === "number" ? o.size : 0,
    createdAt:
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  };
  if (typeof o.width === "number") att.width = o.width;
  if (typeof o.height === "number") att.height = o.height;
  if (typeof o.pageCount === "number") att.pageCount = o.pageCount;
  if (typeof o.ocrText === "string") att.ocrText = o.ocrText;
  if (typeof o.ocrCharCount === "number") att.ocrCharCount = o.ocrCharCount;
  if (typeof o.ocrKoreanCharCount === "number")
    att.ocrKoreanCharCount = o.ocrKoreanCharCount;
  if (typeof o.ocrConfidence === "number") att.ocrConfidence = o.ocrConfidence;
  if (o.ocrLevel === "good" || o.ocrLevel === "warn" || o.ocrLevel === "bad") {
    att.ocrLevel = o.ocrLevel;
  }
  if (typeof o.ocrCheckedAt === "string") att.ocrCheckedAt = o.ocrCheckedAt;
  return att;
}

function parseAttachments(raw: unknown): GsAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: GsAttachment[] = [];
  for (const it of raw) {
    const att = parseAttachment(it);
    if (att) out.push(att);
  }
  return out;
}

export async function listAnswersForSubmission(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<GsAnswerRecord[]> {
  const { data, error } = await client
    .from("gs_answers")
    .select("*")
    .eq("submission_id", submissionId);
  if (error) throw error;
  return (data ?? []).map(mapAnswer);
}

// 답안 행 보장 (없으면 생성). 첨부 추가/제거 전에 호출.
export async function ensureAnswerRow(
  client: SupabaseClient<Database>,
  submissionId: string,
  questionId: string,
): Promise<GsAnswerRecord> {
  const existing = await client
    .from("gs_answers")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (existing.data) return mapAnswer(existing.data);
  const { data, error } = await client
    .from("gs_answers")
    .insert({ submission_id: submissionId, question_id: questionId })
    .select("*")
    .single();
  if (error) throw error;
  return mapAnswer(data);
}

// ---- 답안지 페이지 (submission 단위 N슬롯, 각 슬롯=1파일, 페이지 ↔ 문항 M:N 매핑) ----

export interface GsPage {
  pageId: string;
  submissionId: string;
  pageNumber: number;
  attachment: GsAttachment;
  legibilityConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  // 이 페이지가 매핑된 문항 ID 들. 0개면 메모/여백 페이지.
  questionIds: string[];
}

function mapPage(
  r: Database["public"]["Tables"]["gs_submission_pages"]["Row"],
  questionIds: string[],
): GsPage | null {
  const att = parseAttachment(r.attachment);
  if (!att) return null;
  return {
    pageId: r.page_id,
    submissionId: r.submission_id,
    pageNumber: r.page_number,
    attachment: att,
    legibilityConfirmed: r.legibility_confirmed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    questionIds,
  };
}

// 한 제출의 모든 페이지(매핑 정보 포함). 페이지 번호 오름차순.
export async function listSubmissionPages(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<GsPage[]> {
  const [pagesRes, mapsRes] = await Promise.all([
    client
      .from("gs_submission_pages")
      .select("*")
      .eq("submission_id", submissionId)
      .order("page_number", { ascending: true }),
    client
      .from("gs_question_pages")
      .select("question_id, page_number, order_index")
      .eq("submission_id", submissionId),
  ]);
  if (pagesRes.error) throw pagesRes.error;
  if (mapsRes.error) throw mapsRes.error;

  const qByPage = new Map<number, string[]>();
  for (const m of mapsRes.data ?? []) {
    const list = qByPage.get(m.page_number) ?? [];
    list.push(m.question_id);
    qByPage.set(m.page_number, list);
  }

  const out: GsPage[] = [];
  for (const r of pagesRes.data ?? []) {
    const p = mapPage(r, qByPage.get(r.page_number) ?? []);
    if (p) out.push(p);
  }
  return out;
}

// 페이지 1슬롯 upsert — 신규 또는 교체. 매핑은 별도(setPageQuestions).
export async function upsertSubmissionPage(
  client: SupabaseClient<Database>,
  submissionId: string,
  pageNumber: number,
  attachment: GsAttachment,
): Promise<void> {
  const { error } = await client
    .from("gs_submission_pages")
    .upsert(
      {
        submission_id: submissionId,
        page_number: pageNumber,
        attachment:
          attachment as unknown as Database["public"]["Tables"]["gs_submission_pages"]["Insert"]["attachment"],
        // 새 파일이면 자가확인 리셋.
        legibility_confirmed: false,
      },
      { onConflict: "submission_id,page_number" },
    );
  if (error) throw error;
}

// 페이지 삭제 — storage 파일 제거는 caller 가 책임. 매핑은 FK CASCADE 로 함께 삭제.
export async function deleteSubmissionPage(
  client: SupabaseClient<Database>,
  submissionId: string,
  pageNumber: number,
): Promise<void> {
  const { error } = await client
    .from("gs_submission_pages")
    .delete()
    .eq("submission_id", submissionId)
    .eq("page_number", pageNumber);
  if (error) throw error;
}

// 페이지 → 문항 매핑 전체 교체 (단일 트랜잭션). 빈 배열이면 매핑 모두 제거(메모/여백 페이지).
export async function setPageQuestions(
  client: SupabaseClient<Database>,
  submissionId: string,
  pageNumber: number,
  questionIds: string[],
): Promise<void> {
  // 기존 매핑 삭제 → 신규 insert. trip 회피 위해 트랜잭션은 RPC 가 없으니 순차 처리(짧은 시간 정합 갭).
  const del = await client
    .from("gs_question_pages")
    .delete()
    .eq("submission_id", submissionId)
    .eq("page_number", pageNumber);
  if (del.error) throw del.error;
  if (questionIds.length === 0) return;
  const rows = questionIds.map((qid, i) => ({
    submission_id: submissionId,
    question_id: qid,
    page_number: pageNumber,
    order_index: i,
  }));
  const ins = await client.from("gs_question_pages").insert(rows);
  if (ins.error) throw ins.error;
}

// 두 페이지의 page_number 를 swap (RPC 경유 — 빈 슬롯도 허용 = 편도 이동).
// 매핑은 ON UPDATE CASCADE 로 자동 따라옴.
export async function swapSubmissionPages(
  client: SupabaseClient<Database>,
  submissionId: string,
  pageA: number,
  pageB: number,
): Promise<void> {
  if (pageA === pageB) return;
  const { error } = await client.rpc("gs_swap_pages", {
    p_submission_id: submissionId,
    p_page_a: pageA,
    p_page_b: pageB,
  });
  if (error) throw error;
}

export async function setPageLegibilityConfirmed(
  client: SupabaseClient<Database>,
  submissionId: string,
  pageNumber: number,
  confirmed: boolean,
): Promise<void> {
  const { error } = await client
    .from("gs_submission_pages")
    .update({ legibility_confirmed: confirmed })
    .eq("submission_id", submissionId)
    .eq("page_number", pageNumber);
  if (error) throw error;
}

// 한 문항에 매핑된 페이지들(첨부+OCR 포함). order_index 오름차순.
export async function listPagesForQuestion(
  client: SupabaseClient<Database>,
  submissionId: string,
  questionId: string,
): Promise<GsPage[]> {
  const { data: maps, error } = await client
    .from("gs_question_pages")
    .select("page_number, order_index")
    .eq("submission_id", submissionId)
    .eq("question_id", questionId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  const pageNums = (maps ?? []).map((m) => m.page_number);
  if (pageNums.length === 0) return [];

  const { data: pages, error: e2 } = await client
    .from("gs_submission_pages")
    .select("*")
    .eq("submission_id", submissionId)
    .in("page_number", pageNums);
  if (e2) throw e2;
  const byNum = new Map<number, Database["public"]["Tables"]["gs_submission_pages"]["Row"]>();
  for (const r of pages ?? []) byNum.set(r.page_number, r);

  const out: GsPage[] = [];
  for (const m of maps ?? []) {
    const r = byNum.get(m.page_number);
    if (!r) continue;
    const p = mapPage(r, [questionId]);
    if (p) out.push(p);
  }
  return out;
}

// 학생: 응시 제출. 모든 페이지의 legibility_confirmed=true + 모든 문항이 1+ 페이지 매핑 조건은 caller 에서 확인.
export async function submitOwnSubmission(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_submissions")
    .update({ submitted_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw error;
}

// 첨부 다운로드 — 운영자 또는 본인. RLS 가 추가 차단.
export async function getAttachmentSignedUrl(
  client: SupabaseClient<Database>,
  path: string,
  expiresInSec = 300,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from("gs-answers")
    .createSignedUrl(path, expiresInSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---- 운영자 채점 ----

export interface GradingTarget {
  submission: GsSubmissionSummary;
  studentName: string | null;
  answersGraded: number;
  answersTotal: number;
}

// 한 회차의 제출 목록 + 학생 이름 + 채점 진행도. 운영자 채점 진입용.
export async function listGradingTargets(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<GradingTarget[]> {
  const subs = await listGsSubmissionsForRound(client, roundId);
  if (subs.length === 0) return [];
  const userIds = Array.from(new Set(subs.map((s) => s.userId)));

  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameMap = new Map<string, string | null>();
  for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);

  // 제출 별 채점 진행도 — gs_answers.score IS NOT NULL count.
  const submissionIds = subs.map((s) => s.submissionId);
  const { data: ans } = await client
    .from("gs_answers")
    .select("submission_id, score")
    .in("submission_id", submissionIds);
  const totalsBySub = new Map<string, { graded: number; total: number }>();
  for (const sid of submissionIds)
    totalsBySub.set(sid, { graded: 0, total: 0 });
  for (const a of ans ?? []) {
    const cur = totalsBySub.get(a.submission_id);
    if (!cur) continue;
    cur.total += 1;
    if (a.score != null) cur.graded += 1;
  }

  return subs.map((s) => ({
    submission: s,
    studentName: nameMap.get(s.userId) ?? null,
    answersGraded: totalsBySub.get(s.submissionId)?.graded ?? 0,
    answersTotal: totalsBySub.get(s.submissionId)?.total ?? 0,
  }));
}

export interface GradingDetail {
  submission: GsSubmissionSummary;
  studentName: string | null;
  questions: GsQuestion[];
  answersByQuestion: Map<string, GsAnswerRecord>;
  pages: GsPage[]; // 답안지 전체 페이지 (1..N 순서).
  pagesByQuestion: Map<string, GsPage[]>; // 문항 → order_index 순서로 매핑된 페이지.
}

export async function getGradingDetail(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<GradingDetail | null> {
  const { data: subRow, error } = await client
    .from("gs_submissions")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (error) throw error;
  if (!subRow) return null;
  const submission = mapSubmission(subRow);

  const [profile, questions, answers, pages, mappingsRes] = await Promise.all([
    client
      .from("profiles")
      .select("name")
      .eq("profile_id", submission.userId)
      .maybeSingle(),
    listGsQuestions(client, submission.roundId),
    listAnswersForSubmission(client, submission.submissionId),
    listSubmissionPages(client, submission.submissionId),
    client
      .from("gs_question_pages")
      .select("question_id, page_number, order_index")
      .eq("submission_id", submission.submissionId)
      .order("order_index", { ascending: true }),
  ]);
  if (mappingsRes.error) throw mappingsRes.error;

  const answersByQuestion = new Map<string, GsAnswerRecord>();
  for (const a of answers) answersByQuestion.set(a.questionId, a);

  const pageByNum = new Map<number, GsPage>();
  for (const p of pages) pageByNum.set(p.pageNumber, p);

  const pagesByQuestion = new Map<string, GsPage[]>();
  for (const m of mappingsRes.data ?? []) {
    const p = pageByNum.get(m.page_number);
    if (!p) continue;
    const list = pagesByQuestion.get(m.question_id) ?? [];
    list.push(p);
    pagesByQuestion.set(m.question_id, list);
  }

  return {
    submission,
    studentName: profile.data?.name ?? null,
    questions,
    answersByQuestion,
    pages,
    pagesByQuestion,
  };
}

// 답안 한 건 점수/피드백 업데이트 — RLS staff write.
export async function updateAnswerGrading(
  client: SupabaseClient<Database>,
  submissionId: string,
  questionId: string,
  patch: { score?: number | null; feedbackMd?: string | null },
): Promise<void> {
  const row = await ensureAnswerRow(client, submissionId, questionId);
  const upd: Record<string, unknown> = {};
  if (patch.score !== undefined) upd.score = patch.score;
  if (patch.feedbackMd !== undefined) upd.feedback_md = patch.feedbackMd;
  if (Object.keys(upd).length === 0) return;
  const { error } = await client
    .from("gs_answers")
    .update(upd)
    .eq("answer_id", row.answerId);
  if (error) throw error;
}

// 채점 마무리 — 모든 답안의 score 합산을 total_score 에 저장하고 graded_at, graded_by 설정.
// 점수 미입력 답안은 0 으로 간주.
export async function finalizeGrading(
  client: SupabaseClient<Database>,
  submissionId: string,
  graderId: string,
): Promise<{ totalScore: number }> {
  const answers = await listAnswersForSubmission(client, submissionId);
  let total = 0;
  for (const a of answers) total += a.score ?? 0;
  const { error } = await client
    .from("gs_submissions")
    .update({
      total_score: total,
      graded_at: new Date().toISOString(),
      graded_by: graderId,
    })
    .eq("submission_id", submissionId);
  if (error) throw error;
  return { totalScore: total };
}

export async function unsealGrading(
  client: SupabaseClient<Database>,
  submissionId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_submissions")
    .update({
      total_score: null,
      graded_at: null,
      graded_by: null,
    })
    .eq("submission_id", submissionId);
  if (error) throw error;
}

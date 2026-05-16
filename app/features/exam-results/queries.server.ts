// feat-8-001 합격 데이터 서버 쿼리.
// 본인 read/write 는 RLS 만으로 충분. staff(특히 admin 인증) 처리는 admin client 로 우회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type {
  ExamProfileFields,
  ExamResultRow,
  ExamResultStatus,
  ExamRound,
  ExamVerificationStatus,
} from "./labels";

export type {
  ExamProfileFields,
  ExamResultRow,
  ExamResultStatus,
  ExamRound,
  ExamVerificationStatus,
} from "./labels";

function rowToResult(r: {
  result_id: string;
  user_id: string;
  exam_year: number;
  exam_round: string;
  status: string;
  self_reported_total_score: number | string | null;
  self_reported_subject_scores: unknown;
  verification_status: string;
  certificate_url: string | null;
  certificate_path: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  study_summary_md: string | null;
  created_at: string;
  updated_at: string;
}): ExamResultRow {
  const rawScores = r.self_reported_subject_scores;
  let subjectScores: Record<string, number> | null = null;
  if (rawScores && typeof rawScores === "object" && !Array.isArray(rawScores)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores as Record<string, unknown>)) {
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(num)) out[k] = num;
    }
    if (Object.keys(out).length > 0) subjectScores = out;
  }
  return {
    resultId: r.result_id,
    userId: r.user_id,
    examYear: r.exam_year,
    examRound: r.exam_round as ExamRound,
    status: r.status as ExamResultStatus,
    selfReportedTotalScore:
      r.self_reported_total_score === null
        ? null
        : Number(r.self_reported_total_score),
    selfReportedSubjectScores: subjectScores,
    verificationStatus: r.verification_status as ExamVerificationStatus,
    certificateUrl: r.certificate_url,
    certificatePath: r.certificate_path,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at,
    rejectionReason: r.rejection_reason,
    studySummaryMd: r.study_summary_md,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ROW_SELECT =
  "result_id, user_id, exam_year, exam_round, status, self_reported_total_score, self_reported_subject_scores, verification_status, certificate_url, certificate_path, verified_by, verified_at, rejection_reason, study_summary_md, created_at, updated_at";

// ─── 학생 본인 ───

export async function listMyExamResults(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ExamResultRow[]> {
  const { data, error } = await client
    .from("exam_results")
    .select(ROW_SELECT)
    .eq("user_id", userId)
    .order("exam_year", { ascending: false })
    .order("exam_round", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToResult);
}

export async function getMyExamProfileFields(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ExamProfileFields | null> {
  const { data, error } = await client
    .from("profiles")
    .select("analytics_consent_at, next_exam_year, next_exam_round")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    analyticsConsentAt: data.analytics_consent_at,
    nextExamYear: data.next_exam_year,
    nextExamRound: (data.next_exam_round as ExamRound | null) ?? null,
  };
}

export interface UpsertExamResultInput {
  userId: string;
  examYear: number;
  examRound: ExamRound;
  status: ExamResultStatus;
  selfReportedTotalScore?: number | null;
  selfReportedSubjectScores?: Record<string, number> | null;
  studySummaryMd?: string | null;
}

export async function upsertMyExamResult(
  client: SupabaseClient<Database>,
  input: UpsertExamResultInput,
): Promise<
  { ok: true; resultId: string } | { ok: false; error: string }
> {
  const payload = {
    user_id: input.userId,
    exam_year: input.examYear,
    exam_round: input.examRound,
    status: input.status,
    self_reported_total_score: input.selfReportedTotalScore ?? null,
    self_reported_subject_scores: input.selfReportedSubjectScores ?? null,
    study_summary_md: input.studySummaryMd ?? null,
  };
  const { data, error } = await client
    .from("exam_results")
    .upsert(payload, { onConflict: "user_id,exam_year,exam_round" })
    .select("result_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, resultId: data.result_id };
}

export async function deleteMyExamResult(
  client: SupabaseClient<Database>,
  userId: string,
  resultId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("exam_results")
    .delete()
    .eq("result_id", resultId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setAnalyticsConsent(
  client: SupabaseClient<Database>,
  userId: string,
  consented: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("profiles")
    .update({
      analytics_consent_at: consented ? new Date().toISOString() : null,
    })
    .eq("profile_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setNextExamPlan(
  client: SupabaseClient<Database>,
  userId: string,
  patch: {
    nextExamYear: number | null;
    nextExamRound: ExamRound | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("profiles")
    .update({
      next_exam_year: patch.nextExamYear,
      next_exam_round: patch.nextExamRound,
    })
    .eq("profile_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function attachCertificate(
  client: SupabaseClient<Database>,
  userId: string,
  resultId: string,
  storagePath: string,
  publicUrl: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("exam_results")
    .update({
      certificate_path: storagePath,
      certificate_url: publicUrl,
      verification_status: "document_submitted",
    })
    .eq("result_id", resultId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  // best-effort: admin 인박스 알림
  try {
    const admin = adminClient as SupabaseClient<Database>;
    const { data: admins } = await admin
      .from("profiles")
      .select("profile_id, name")
      .eq("role", "admin");
    if (admins && admins.length > 0) {
      const rows = admins.map((a) => ({
        recipient_id: a.profile_id,
        kind: "exam_certificate_submitted" as const,
        entity_type: "exam_result",
        entity_id: resultId,
        title: "합격 결과 증빙 제출",
        body: "학생이 합격증/성적표를 제출했습니다. 인증 처리 필요.",
        href: `/admin/exam-results?result=${resultId}`,
        payload: { resultId, userId },
      }));
      await admin.from("user_notifications").insert(rows);
    }
  } catch (e) {
    console.warn(
      "[attachCertificate] staff notification fanout failed",
      e instanceof Error ? e.message : String(e),
    );
  }
  return { ok: true };
}

// ─── 운영자(admin) ───

export interface AdminExamResultRow extends ExamResultRow {
  userName: string;
  userEmail: string | null;
}

export interface ListAdminExamResultsFilter {
  year?: number | null;
  round?: ExamRound | null;
  status?: ExamResultStatus | null;
  verificationStatus?: ExamVerificationStatus | null;
  search?: string | null;
}

export async function listAdminExamResults(
  filter: ListAdminExamResultsFilter,
): Promise<AdminExamResultRow[]> {
  const admin = adminClient as SupabaseClient<Database>;
  let q = admin
    .from("exam_results")
    .select(`${ROW_SELECT}, profiles!exam_results_user_id_fkey(name)`)
    .order("exam_year", { ascending: false })
    .order("verification_status", { ascending: true })
    .limit(500);

  if (filter.year !== null && filter.year !== undefined) q = q.eq("exam_year", filter.year);
  if (filter.round) q = q.eq("exam_round", filter.round);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.verificationStatus)
    q = q.eq("verification_status", filter.verificationStatus);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    base: rowToResult(r),
    userName: r.profiles?.name ?? "(이름없음)",
  }));

  // 이메일 lookup (best-effort)
  const userIds = Array.from(new Set(rows.map((r) => r.base.userId)));
  const emailById = new Map<string, string | null>();
  try {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!list.error) {
      for (const u of list.data.users) emailById.set(u.id, u.email ?? null);
    }
  } catch (e) {
    console.warn(
      "[listAdminExamResults] listUsers threw",
      e instanceof Error ? e.message : String(e),
    );
  }

  const search = filter.search?.trim().toLowerCase() ?? "";
  return rows
    .map((r) => ({
      ...r.base,
      userName: r.userName,
      userEmail: emailById.get(r.base.userId) ?? null,
    }))
    .filter((r) => {
      if (!search) return true;
      return (
        r.userName.toLowerCase().includes(search) ||
        (r.userEmail ?? "").toLowerCase().includes(search)
      );
    });
}

export async function verifyExamResult(
  resultId: string,
  verifiedBy: string,
  decision: "verified" | "rejected",
  rejectionReason?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("exam_results")
    .update({
      verification_status: decision,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      rejection_reason: decision === "rejected" ? rejectionReason ?? null : null,
    })
    .eq("result_id", resultId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getAdminExamResultPoolSize(): Promise<{
  passedVerified: number;
  passedTotal: number;
  failedTotal: number;
  pending: number;
  consented: number;
}> {
  const admin = adminClient as SupabaseClient<Database>;
  const [
    { count: passedVerified },
    { count: passedTotal },
    { count: failedTotal },
    { count: pending },
    { count: consented },
  ] = await Promise.all([
    admin
      .from("exam_results")
      .select("result_id", { head: true, count: "exact" })
      .eq("status", "passed")
      .eq("verification_status", "verified"),
    admin
      .from("exam_results")
      .select("result_id", { head: true, count: "exact" })
      .eq("status", "passed"),
    admin
      .from("exam_results")
      .select("result_id", { head: true, count: "exact" })
      .eq("status", "failed"),
    admin
      .from("exam_results")
      .select("result_id", { head: true, count: "exact" })
      .eq("verification_status", "document_submitted"),
    admin
      .from("profiles")
      .select("profile_id", { head: true, count: "exact" })
      .not("analytics_consent_at", "is", null),
  ]);
  return {
    passedVerified: passedVerified ?? 0,
    passedTotal: passedTotal ?? 0,
    failedTotal: failedTotal ?? 0,
    pending: pending ?? 0,
    consented: consented ?? 0,
  };
}

// 합격증 storage signed URL — admin/staff 전용 (private bucket)
export async function createCertificateSignedUrl(
  path: string,
  expiresInSec = 300,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin.storage
    .from("exam-certificates")
    .createSignedUrl(path, expiresInSec);
  if (error) return { ok: false, error: error.message };
  return { ok: true, url: data.signedUrl };
}

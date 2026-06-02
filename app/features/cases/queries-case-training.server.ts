// 판례 기반 쟁점추출 훈련 — 강사 출제 + 학생 응시 쿼리.
// case_training_items, case_training_issues, case_issue_attempts.
// RLS 가 권한 제어 → 일반 supa-client 사용. service_role 불필요.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "~/../database.types";
import type {
  AiAnalysis,
  MasterIssue,
  SelfCheck,
} from "~/features/issue-extraction/lib/types";

type Client = SupabaseClient<Database>;

// ============================================================================
// Types
// ============================================================================

export interface CaseTrainingItem {
  itemId: string;
  caseId: string;
  factsSummaryMd: string;
  factsGeneratedBy: "ai" | "staff";
  reviewStatus: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  rejectedReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CaseTrainingIssueRow extends MasterIssue {
  reviewStatus: "draft" | "approved" | "rejected";
  generatedBy: "ai" | "staff";
  orderIndex: number;
  refArticleId: string | null;
  refCaseId: string | null;
}

export interface CaseRefForTraining {
  caseId: string;
  caseTitle: string;
  caseNumber: string;
  court: string;
  decidedAt: string;
  hasOfficialText: boolean;
  hasPdf: boolean;
}

export interface CaseTrainingAttempt {
  attemptId: string;
  itemId: string;
  studentIssuesMd: string;
  selfCheck: SelfCheck | null;
  aiAnalysis: AiAnalysis | null;
  submittedAt: string | null;
  selfCheckedAt: string | null;
  aiAnalyzedAt: string | null;
  doneAt: string | null;
}

// ============================================================================
// Student-facing queries (approved only — RLS 가 다시 차단하지만 명시적 필터 유지)
// ============================================================================

export async function listApprovedCaseTrainingItems(
  client: Client,
): Promise<Array<CaseTrainingItem & { caseRef: CaseRefForTraining }>> {
  const { data, error } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path )`,
    )
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .order("approved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const c = (r.cases ?? null) as {
      case_id: string;
      case_title: string;
      case_number: string;
      court: string;
      decided_at: string;
      official_text_md: string | null;
      official_text_pdf_path: string | null;
    } | null;
    return {
      itemId: r.item_id,
      caseId: r.case_id,
      factsSummaryMd: r.facts_summary_md,
      factsGeneratedBy: r.facts_generated_by as "ai" | "staff",
      reviewStatus: r.review_status as "draft" | "approved" | "rejected",
      approvedAt: r.approved_at,
      rejectedReason: r.rejected_reason,
      createdBy: r.created_by,
      createdAt: r.created_at,
      caseRef: {
        caseId: c?.case_id ?? r.case_id,
        caseTitle: c?.case_title ?? "",
        caseNumber: c?.case_number ?? "",
        court: c?.court ?? "",
        decidedAt: c?.decided_at ?? "",
        hasOfficialText: !!c?.official_text_md,
        hasPdf: !!c?.official_text_pdf_path,
      },
    };
  });
}

/** 학생용 — 승인된 항목 1건 + 승인된 쟁점. 전문/판시사항은 별도 함수에서. */
export async function getApprovedCaseTrainingItem(
  client: Client,
  itemId: string,
): Promise<{
  item: CaseTrainingItem;
  caseRef: CaseRefForTraining;
  approvedIssues: CaseTrainingIssueRow[];
} | null> {
  const { data: itemRow, error: itemErr } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path )`,
    )
    .eq("item_id", itemId)
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .maybeSingle();
  if (itemErr) throw itemErr;
  if (!itemRow) return null;
  const c = (itemRow.cases ?? null) as {
    case_id: string;
    case_title: string;
    case_number: string;
    court: string;
    decided_at: string;
    official_text_md: string | null;
    official_text_pdf_path: string | null;
  } | null;

  const { data: issueRows, error: issErr } = await client
    .from("case_training_issues")
    .select(
      `issue_id, item_id, label, description_md, importance, ref_article_id, ref_case_id, ref_hint, order_index, review_status, generated_by`,
    )
    .eq("item_id", itemId)
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .order("order_index");
  if (issErr) throw issErr;

  const approvedIssues: CaseTrainingIssueRow[] = (issueRows ?? []).map((r) => ({
    issueId: r.issue_id,
    label: r.label,
    descriptionMd: r.description_md,
    importance: r.importance as "core" | "side",
    refHint: r.ref_hint,
    refArticleId: r.ref_article_id,
    refCaseId: r.ref_case_id,
    orderIndex: r.order_index,
    reviewStatus: r.review_status as "draft" | "approved" | "rejected",
    generatedBy: r.generated_by as "ai" | "staff",
  }));

  return {
    item: {
      itemId: itemRow.item_id,
      caseId: itemRow.case_id,
      factsSummaryMd: itemRow.facts_summary_md,
      factsGeneratedBy: itemRow.facts_generated_by as "ai" | "staff",
      reviewStatus: itemRow.review_status as "draft" | "approved" | "rejected",
      approvedAt: itemRow.approved_at,
      rejectedReason: itemRow.rejected_reason,
      createdBy: itemRow.created_by,
      createdAt: itemRow.created_at,
    },
    caseRef: {
      caseId: c?.case_id ?? itemRow.case_id,
      caseTitle: c?.case_title ?? "",
      caseNumber: c?.case_number ?? "",
      court: c?.court ?? "",
      decidedAt: c?.decided_at ?? "",
      hasOfficialText: !!c?.official_text_md,
      hasPdf: !!c?.official_text_pdf_path,
    },
    approvedIssues,
  };
}

// ============================================================================
// Staff queries (RLS = is_staff). 모든 status 노출, 직접 CRUD.
// ============================================================================

export async function listCaseTrainingItemsForStaff(
  client: Client,
): Promise<Array<CaseTrainingItem & { caseRef: CaseRefForTraining; issueCount: number; approvedIssueCount: number }>> {
  const { data, error } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path ),
       case_training_issues ( issue_id, review_status, deleted_at )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const c = (r.cases ?? null) as {
      case_id: string;
      case_title: string;
      case_number: string;
      court: string;
      decided_at: string;
      official_text_md: string | null;
      official_text_pdf_path: string | null;
    } | null;
    const issues = (r.case_training_issues ?? []) as Array<{
      issue_id: string;
      review_status: string;
      deleted_at: string | null;
    }>;
    const liveIssues = issues.filter((i) => i.deleted_at === null);
    return {
      itemId: r.item_id,
      caseId: r.case_id,
      factsSummaryMd: r.facts_summary_md,
      factsGeneratedBy: r.facts_generated_by as "ai" | "staff",
      reviewStatus: r.review_status as "draft" | "approved" | "rejected",
      approvedAt: r.approved_at,
      rejectedReason: r.rejected_reason,
      createdBy: r.created_by,
      createdAt: r.created_at,
      caseRef: {
        caseId: c?.case_id ?? r.case_id,
        caseTitle: c?.case_title ?? "",
        caseNumber: c?.case_number ?? "",
        court: c?.court ?? "",
        decidedAt: c?.decided_at ?? "",
        hasOfficialText: !!c?.official_text_md,
        hasPdf: !!c?.official_text_pdf_path,
      },
      issueCount: liveIssues.length,
      approvedIssueCount: liveIssues.filter((i) => i.review_status === "approved").length,
    };
  });
}

export async function getCaseTrainingItemForStaff(
  client: Client,
  itemId: string,
): Promise<{
  item: CaseTrainingItem;
  caseRef: CaseRefForTraining;
  caseOfficialTextMd: string | null;
  issues: CaseTrainingIssueRow[];
} | null> {
  const { data: itemRow, error: itemErr } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path )`,
    )
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (itemErr) throw itemErr;
  if (!itemRow) return null;
  const c = (itemRow.cases ?? null) as {
    case_id: string;
    case_title: string;
    case_number: string;
    court: string;
    decided_at: string;
    official_text_md: string | null;
    official_text_pdf_path: string | null;
  } | null;

  const { data: issueRows, error: issErr } = await client
    .from("case_training_issues")
    .select(
      `issue_id, item_id, label, description_md, importance, ref_article_id, ref_case_id, ref_hint, order_index, review_status, generated_by`,
    )
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .order("order_index");
  if (issErr) throw issErr;

  return {
    item: {
      itemId: itemRow.item_id,
      caseId: itemRow.case_id,
      factsSummaryMd: itemRow.facts_summary_md,
      factsGeneratedBy: itemRow.facts_generated_by as "ai" | "staff",
      reviewStatus: itemRow.review_status as "draft" | "approved" | "rejected",
      approvedAt: itemRow.approved_at,
      rejectedReason: itemRow.rejected_reason,
      createdBy: itemRow.created_by,
      createdAt: itemRow.created_at,
    },
    caseRef: {
      caseId: c?.case_id ?? itemRow.case_id,
      caseTitle: c?.case_title ?? "",
      caseNumber: c?.case_number ?? "",
      court: c?.court ?? "",
      decidedAt: c?.decided_at ?? "",
      hasOfficialText: !!c?.official_text_md,
      hasPdf: !!c?.official_text_pdf_path,
    },
    caseOfficialTextMd: c?.official_text_md ?? null,
    issues: (issueRows ?? []).map((r) => ({
      issueId: r.issue_id,
      label: r.label,
      descriptionMd: r.description_md,
      importance: r.importance as "core" | "side",
      refHint: r.ref_hint,
      refArticleId: r.ref_article_id,
      refCaseId: r.ref_case_id,
      orderIndex: r.order_index,
      reviewStatus: r.review_status as "draft" | "approved" | "rejected",
      generatedBy: r.generated_by as "ai" | "staff",
    })),
  };
}

export async function createCaseTrainingItem(
  client: Client,
  caseId: string,
  createdBy: string,
): Promise<string> {
  const { data, error } = await client
    .from("case_training_items")
    .insert({ case_id: caseId, facts_summary_md: "", created_by: createdBy })
    .select("item_id")
    .single();
  if (error) throw error;
  return data.item_id;
}

export async function updateCaseTrainingItemFacts(
  client: Client,
  itemId: string,
  factsMd: string,
  generatedBy: "ai" | "staff",
): Promise<void> {
  const { error } = await client
    .from("case_training_items")
    .update({ facts_summary_md: factsMd, facts_generated_by: generatedBy })
    .eq("item_id", itemId);
  if (error) throw error;
}

export async function approveCaseTrainingItem(
  client: Client,
  itemId: string,
  approvedBy: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_items")
    .update({
      review_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
      rejected_reason: null,
    })
    .eq("item_id", itemId);
  if (error) throw error;
}

export async function unapproveCaseTrainingItem(
  client: Client,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_items")
    .update({
      review_status: "draft",
      approved_at: null,
      approved_by: null,
    })
    .eq("item_id", itemId);
  if (error) throw error;
}

export async function softDeleteCaseTrainingItem(
  client: Client,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("item_id", itemId);
  if (error) throw error;
}

// ============================================================================
// Issue CRUD (staff)
// ============================================================================

export interface IssueDraftInput {
  label: string;
  descriptionMd: string;
  importance: "core" | "side";
  refHint?: string;
}

export async function bulkInsertCaseTrainingIssues(
  client: Client,
  itemId: string,
  drafts: IssueDraftInput[],
  generatedBy: "ai" | "staff",
  createdBy: string,
): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d, i) => ({
    item_id: itemId,
    label: d.label,
    description_md: d.descriptionMd || null,
    importance: d.importance,
    ref_hint: d.refHint || null,
    order_index: i,
    generated_by: generatedBy,
    created_by: createdBy,
  }));
  const { error } = await client.from("case_training_issues").insert(rows);
  if (error) throw error;
}

export async function updateCaseTrainingIssue(
  client: Client,
  issueId: string,
  patch: Partial<{
    label: string;
    descriptionMd: string;
    importance: "core" | "side";
    refHint: string | null;
    orderIndex: number;
  }>,
): Promise<void> {
  const up: Record<string, unknown> = {};
  if (patch.label !== undefined) up.label = patch.label;
  if (patch.descriptionMd !== undefined)
    up.description_md = patch.descriptionMd || null;
  if (patch.importance !== undefined) up.importance = patch.importance;
  if (patch.refHint !== undefined) up.ref_hint = patch.refHint || null;
  if (patch.orderIndex !== undefined) up.order_index = patch.orderIndex;
  if (Object.keys(up).length === 0) return;
  const { error } = await client
    .from("case_training_issues")
    .update(up)
    .eq("issue_id", issueId);
  if (error) throw error;
}

export async function approveCaseTrainingIssue(
  client: Client,
  issueId: string,
  approvedBy: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_issues")
    .update({
      review_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
      rejected_reason: null,
    })
    .eq("issue_id", issueId);
  if (error) throw error;
}

export async function unapproveCaseTrainingIssue(
  client: Client,
  issueId: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_issues")
    .update({
      review_status: "draft",
      approved_at: null,
      approved_by: null,
    })
    .eq("issue_id", issueId);
  if (error) throw error;
}

export async function softDeleteCaseTrainingIssue(
  client: Client,
  issueId: string,
): Promise<void> {
  const { error } = await client
    .from("case_training_issues")
    .update({ deleted_at: new Date().toISOString() })
    .eq("issue_id", issueId);
  if (error) throw error;
}

// ============================================================================
// Attempt CRUD (학생)
// ============================================================================

export async function getMyCaseAttempt(
  client: Client,
  userId: string,
  itemId: string,
): Promise<CaseTrainingAttempt | null> {
  const { data, error } = await client
    .from("case_issue_attempts")
    .select(
      `attempt_id, item_id, student_issues_md, self_check, ai_analysis,
       submitted_at, self_checked_at, ai_analyzed_at, done_at`,
    )
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    attemptId: data.attempt_id,
    itemId: data.item_id,
    studentIssuesMd: data.student_issues_md,
    selfCheck: (data.self_check as SelfCheck | null) ?? null,
    aiAnalysis: (data.ai_analysis as AiAnalysis | null) ?? null,
    submittedAt: data.submitted_at,
    selfCheckedAt: data.self_checked_at,
    aiAnalyzedAt: data.ai_analyzed_at,
    doneAt: data.done_at,
  };
}

export async function upsertCaseAttemptDraft(
  client: Client,
  userId: string,
  itemId: string,
  draftMd: string,
): Promise<string> {
  // 1) 기존 있는지 확인
  const { data: existing } = await client
    .from("case_issue_attempts")
    .select("attempt_id, submitted_at")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing && existing.submitted_at) {
    // 제출 이후엔 draft 수정 불가
    return existing.attempt_id;
  }
  if (existing) {
    const { error } = await client
      .from("case_issue_attempts")
      .update({ student_issues_md: draftMd })
      .eq("attempt_id", existing.attempt_id);
    if (error) throw error;
    return existing.attempt_id;
  }
  const { data, error } = await client
    .from("case_issue_attempts")
    .insert({
      user_id: userId,
      item_id: itemId,
      student_issues_md: draftMd,
    })
    .select("attempt_id")
    .single();
  if (error) throw error;
  return data.attempt_id;
}

export async function submitCaseAttempt(
  client: Client,
  userId: string,
  itemId: string,
  draftMd: string,
): Promise<void> {
  const attemptId = await upsertCaseAttemptDraft(client, userId, itemId, draftMd);
  const { error } = await client
    .from("case_issue_attempts")
    .update({
      student_issues_md: draftMd,
      submitted_at: new Date().toISOString(),
    })
    .eq("attempt_id", attemptId)
    .is("submitted_at", null);
  if (error) throw error;
}

export async function selfCheckCaseAttempt(
  client: Client,
  userId: string,
  itemId: string,
  selfCheck: SelfCheck,
): Promise<void> {
  const { error } = await client
    .from("case_issue_attempts")
    .update({
      self_check: selfCheck as unknown as Database["public"]["Tables"]["case_issue_attempts"]["Update"]["self_check"],
      self_checked_at: new Date().toISOString(),
      done_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function setCaseAttemptAiAnalysis(
  client: Client,
  userId: string,
  itemId: string,
  analysis: AiAnalysis,
): Promise<void> {
  const { error } = await client
    .from("case_issue_attempts")
    .update({
      ai_analysis: analysis as unknown as Database["public"]["Tables"]["case_issue_attempts"]["Update"]["ai_analysis"],
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function resetCaseAttempt(
  client: Client,
  userId: string,
  itemId: string,
): Promise<void> {
  // soft delete 후 새로 시작 — 학습 데이터 보호 원칙.
  const { error } = await client
    .from("case_issue_attempts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

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
  /** 판례 소스. feat-2-028 부터 problem_id 와 XOR — 기출 소스면 null. */
  caseId: string | null;
  /** 2차 기출 문항 소스 — 판례 소스면 null. */
  problemId: string | null;
  factsSummaryMd: string;
  factsGeneratedBy: "ai" | "staff";
  reviewStatus: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  rejectedReason: string | null;
  createdBy: string | null;
  createdAt: string;
  /** ⑤ GS 답안작성 연결 — 선택. */
  linkedGsRoundId: string | null;
}

export interface CaseTrainingIssueRow extends MasterIssue {
  reviewStatus: "draft" | "approved" | "rejected";
  generatedBy: "ai" | "staff";
  orderIndex: number;
  refArticleId: string | null;
  refCaseId: string | null;
  // ③④ 결론·강약 채점 기준 (선택).
  weight: number | null;
  modelConclusionDirection: string | null;
  modelConclusionMd: string | null;
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

/** feat-2-028 — 2차 기출 문항 소스 참조(발문=지문). */
export interface ProblemRefForTraining {
  problemId: string;
  lawCode: string | null;
  year: number | null;
  problemNumber: number | null;
  bodyMd: string;
}

type ProblemJoinRow = {
  problem_id: string;
  year: number | null;
  problem_number: number | null;
  body_md: string | null;
  laws: { law_code: string } | null;
} | null;

function mapProblemRef(p: ProblemJoinRow): ProblemRefForTraining | null {
  if (!p) return null;
  return {
    problemId: p.problem_id,
    lawCode: p.laws?.law_code ?? null,
    year: p.year,
    problemNumber: p.problem_number,
    bodyMd: p.body_md ?? "",
  };
}

const PROBLEM_JOIN =
  "problems:problem_id ( problem_id, year, problem_number, body_md, laws ( law_code ) )";

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
): Promise<
  Array<
    CaseTrainingItem & {
      caseRef: CaseRefForTraining;
      problemRef: ProblemRefForTraining | null;
      conclusionReadyCount: number;
    }
  >
> {
  const { data, error } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, problem_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at, linked_gs_round_id,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path ),
       ${PROBLEM_JOIN},
       case_training_issues ( review_status, deleted_at, model_conclusion_direction )`,
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
    const issues = (r.case_training_issues ?? []) as Array<{
      review_status: string;
      deleted_at: string | null;
      model_conclusion_direction: string | null;
    }>;
    const conclusionReadyCount = issues.filter(
      (i) =>
        i.deleted_at === null &&
        i.review_status === "approved" &&
        (i.model_conclusion_direction ?? "").trim().length > 0,
    ).length;
    return {
      itemId: r.item_id,
      caseId: r.case_id,
      problemId: r.problem_id,
      factsSummaryMd: r.facts_summary_md,
      factsGeneratedBy: r.facts_generated_by as "ai" | "staff",
      reviewStatus: r.review_status as "draft" | "approved" | "rejected",
      approvedAt: r.approved_at,
      rejectedReason: r.rejected_reason,
      createdBy: r.created_by,
      createdAt: r.created_at,
      linkedGsRoundId: r.linked_gs_round_id,
      caseRef: {
        caseId: c?.case_id ?? r.case_id ?? "",
        caseTitle: c?.case_title ?? "",
        caseNumber: c?.case_number ?? "",
        court: c?.court ?? "",
        decidedAt: c?.decided_at ?? "",
        hasOfficialText: !!c?.official_text_md,
        hasPdf: !!c?.official_text_pdf_path,
      },
      problemRef: mapProblemRef((r.problems ?? null) as ProblemJoinRow),
      conclusionReadyCount,
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
  problemRef: ProblemRefForTraining | null;
  approvedIssues: CaseTrainingIssueRow[];
} | null> {
  const { data: itemRow, error: itemErr } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, problem_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at, linked_gs_round_id,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path ),
       ${PROBLEM_JOIN}`,
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
      `issue_id, item_id, label, description_md, importance, ref_article_id, ref_case_id, ref_hint, order_index, review_status, generated_by, weight, model_conclusion_direction, model_conclusion_md`,
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
    weight: r.weight,
    modelConclusionDirection: r.model_conclusion_direction,
    modelConclusionMd: r.model_conclusion_md,
  }));

  return {
    item: {
      itemId: itemRow.item_id,
      caseId: itemRow.case_id,
      problemId: itemRow.problem_id,
      factsSummaryMd: itemRow.facts_summary_md,
      factsGeneratedBy: itemRow.facts_generated_by as "ai" | "staff",
      reviewStatus: itemRow.review_status as "draft" | "approved" | "rejected",
      approvedAt: itemRow.approved_at,
      rejectedReason: itemRow.rejected_reason,
      createdBy: itemRow.created_by,
      createdAt: itemRow.created_at,
      linkedGsRoundId: itemRow.linked_gs_round_id,
    },
    caseRef: {
      caseId: c?.case_id ?? itemRow.case_id ?? "",
      caseTitle: c?.case_title ?? "",
      caseNumber: c?.case_number ?? "",
      court: c?.court ?? "",
      decidedAt: c?.decided_at ?? "",
      hasOfficialText: !!c?.official_text_md,
      hasPdf: !!c?.official_text_pdf_path,
    },
    problemRef: mapProblemRef((itemRow.problems ?? null) as ProblemJoinRow),
    approvedIssues,
  };
}

// ============================================================================
// Staff queries (RLS = is_staff). 모든 status 노출, 직접 CRUD.
// ============================================================================

export async function listCaseTrainingItemsForStaff(
  client: Client,
): Promise<Array<CaseTrainingItem & { caseRef: CaseRefForTraining; problemRef: ProblemRefForTraining | null; issueCount: number; approvedIssueCount: number }>> {
  const { data, error } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, problem_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at, linked_gs_round_id,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path ),
       ${PROBLEM_JOIN},
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
      problemId: r.problem_id,
      factsSummaryMd: r.facts_summary_md,
      factsGeneratedBy: r.facts_generated_by as "ai" | "staff",
      reviewStatus: r.review_status as "draft" | "approved" | "rejected",
      approvedAt: r.approved_at,
      rejectedReason: r.rejected_reason,
      createdBy: r.created_by,
      createdAt: r.created_at,
      linkedGsRoundId: r.linked_gs_round_id,
      caseRef: {
        caseId: c?.case_id ?? r.case_id ?? "",
        caseTitle: c?.case_title ?? "",
        caseNumber: c?.case_number ?? "",
        court: c?.court ?? "",
        decidedAt: c?.decided_at ?? "",
        hasOfficialText: !!c?.official_text_md,
        hasPdf: !!c?.official_text_pdf_path,
      },
      problemRef: mapProblemRef((r.problems ?? null) as ProblemJoinRow),
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
  problemRef: ProblemRefForTraining | null;
  /** 기출 소스의 해설/채점평 — AI 초안 입력용. */
  problemExplanationMd: string | null;
  issues: CaseTrainingIssueRow[];
} | null> {
  const { data: itemRow, error: itemErr } = await client
    .from("case_training_items")
    .select(
      `item_id, case_id, problem_id, facts_summary_md, facts_generated_by, review_status,
       approved_at, rejected_reason, created_by, created_at, linked_gs_round_id,
       cases:case_id ( case_id, case_title, case_number, court, decided_at, official_text_md, official_text_pdf_path ),
       problems:problem_id ( problem_id, year, problem_number, body_md, explanation_md, laws ( law_code ) )`,
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
      `issue_id, item_id, label, description_md, importance, ref_article_id, ref_case_id, ref_hint, order_index, review_status, generated_by, weight, model_conclusion_direction, model_conclusion_md`,
    )
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .order("order_index");
  if (issErr) throw issErr;

  return {
    item: {
      itemId: itemRow.item_id,
      caseId: itemRow.case_id,
      problemId: itemRow.problem_id,
      factsSummaryMd: itemRow.facts_summary_md,
      factsGeneratedBy: itemRow.facts_generated_by as "ai" | "staff",
      reviewStatus: itemRow.review_status as "draft" | "approved" | "rejected",
      approvedAt: itemRow.approved_at,
      rejectedReason: itemRow.rejected_reason,
      createdBy: itemRow.created_by,
      createdAt: itemRow.created_at,
      linkedGsRoundId: itemRow.linked_gs_round_id,
    },
    caseRef: {
      caseId: c?.case_id ?? itemRow.case_id ?? "",
      caseTitle: c?.case_title ?? "",
      caseNumber: c?.case_number ?? "",
      court: c?.court ?? "",
      decidedAt: c?.decided_at ?? "",
      hasOfficialText: !!c?.official_text_md,
      hasPdf: !!c?.official_text_pdf_path,
    },
    caseOfficialTextMd: c?.official_text_md ?? null,
    problemRef: mapProblemRef((itemRow.problems ?? null) as ProblemJoinRow),
    problemExplanationMd:
      (itemRow.problems as { explanation_md?: string | null } | null)
        ?.explanation_md ?? null,
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
      weight: r.weight,
      modelConclusionDirection: r.model_conclusion_direction,
      modelConclusionMd: r.model_conclusion_md,
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

/** feat-2-028 — 2차 기출 문항 소스 훈련 항목 생성(발문=지문, facts 불필요). */
export async function createProblemTrainingItem(
  client: Client,
  problemId: string,
  createdBy: string,
): Promise<string> {
  const { data, error } = await client
    .from("case_training_items")
    .insert({
      problem_id: problemId,
      facts_summary_md: "",
      created_by: createdBy,
    })
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

// ============================================================================
// ③④ 결론·강약 — staff: linked_gs / conclusion 컬럼 update + AI 일괄 적용
// ============================================================================

export async function updateCaseTrainingItemLinkedGs(
  client: Client,
  itemId: string,
  roundId: string | null,
): Promise<void> {
  const { error } = await client
    .from("case_training_items")
    .update({ linked_gs_round_id: roundId })
    .eq("item_id", itemId);
  if (error) throw error;
}

export interface IssueConclusionPatch {
  weight?: number | null;
  modelConclusionDirection?: string | null;
  modelConclusionMd?: string | null;
}

export async function updateCaseTrainingIssueConclusion(
  client: Client,
  issueId: string,
  patch: IssueConclusionPatch,
): Promise<void> {
  const up: Record<string, unknown> = {};
  if (patch.weight !== undefined) up.weight = patch.weight;
  if (patch.modelConclusionDirection !== undefined)
    up.model_conclusion_direction = patch.modelConclusionDirection || null;
  if (patch.modelConclusionMd !== undefined)
    up.model_conclusion_md = patch.modelConclusionMd || null;
  if (Object.keys(up).length === 0) return;
  const { error } = await client
    .from("case_training_issues")
    .update(up)
    .eq("issue_id", issueId);
  if (error) throw error;
}

export interface AiConclusionDraft {
  issueId: string;
  weight: number | null;
  modelConclusionDirection: string;
  modelConclusionMd: string;
}

export async function bulkApplyAiConclusionDrafts(
  client: Client,
  drafts: AiConclusionDraft[],
): Promise<void> {
  // 행 단위 update (PostgREST 일괄 update 제약 — 개별 호출).
  for (const d of drafts) {
    await updateCaseTrainingIssueConclusion(client, d.issueId, {
      weight: d.weight,
      modelConclusionDirection: d.modelConclusionDirection,
      modelConclusionMd: d.modelConclusionMd,
    });
  }
}

// ============================================================================
// ③④ 결론·강약 — 학생 attempt CRUD (case_conclusion_attempts)
// ============================================================================

import type {
  ConclusionAiAnalysis,
  ConclusionSelfCheck,
  ConclusionsMap,
  EmphasisMap,
} from "~/features/issue-extraction/lib/types";

export interface CaseConclusionAttempt {
  attemptId: string;
  itemId: string;
  conclusions: ConclusionsMap | null;
  emphasisMap: EmphasisMap | null;
  outlineMd: string;
  selfCheck: ConclusionSelfCheck | null;
  aiAnalysis: ConclusionAiAnalysis | null;
  submittedAt: string | null;
  selfCheckedAt: string | null;
  aiAnalyzedAt: string | null;
  doneAt: string | null;
}

export async function getMyConclusionAttempt(
  client: Client,
  userId: string,
  itemId: string,
): Promise<CaseConclusionAttempt | null> {
  const { data, error } = await client
    .from("case_conclusion_attempts")
    .select(
      `attempt_id, item_id, conclusions, emphasis_map, outline_md,
       self_check, ai_analysis,
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
    conclusions: (data.conclusions as ConclusionsMap | null) ?? null,
    emphasisMap: (data.emphasis_map as EmphasisMap | null) ?? null,
    outlineMd: data.outline_md,
    selfCheck: (data.self_check as ConclusionSelfCheck | null) ?? null,
    aiAnalysis: (data.ai_analysis as ConclusionAiAnalysis | null) ?? null,
    submittedAt: data.submitted_at,
    selfCheckedAt: data.self_checked_at,
    aiAnalyzedAt: data.ai_analyzed_at,
    doneAt: data.done_at,
  };
}

export async function upsertConclusionAttemptDraft(
  client: Client,
  userId: string,
  itemId: string,
  patch: {
    conclusions: ConclusionsMap;
    emphasisMap: EmphasisMap;
    outlineMd: string;
  },
): Promise<string> {
  const { data: existing } = await client
    .from("case_conclusion_attempts")
    .select("attempt_id, submitted_at")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing && existing.submitted_at) {
    return existing.attempt_id;
  }
  const payload = {
    conclusions: patch.conclusions as unknown as Database["public"]["Tables"]["case_conclusion_attempts"]["Update"]["conclusions"],
    emphasis_map: patch.emphasisMap as unknown as Database["public"]["Tables"]["case_conclusion_attempts"]["Update"]["emphasis_map"],
    outline_md: patch.outlineMd,
  };
  if (existing) {
    const { error } = await client
      .from("case_conclusion_attempts")
      .update(payload)
      .eq("attempt_id", existing.attempt_id);
    if (error) throw error;
    return existing.attempt_id;
  }
  const { data, error } = await client
    .from("case_conclusion_attempts")
    .insert({ user_id: userId, item_id: itemId, ...payload })
    .select("attempt_id")
    .single();
  if (error) throw error;
  return data.attempt_id;
}

export async function submitConclusionAttempt(
  client: Client,
  userId: string,
  itemId: string,
  patch: {
    conclusions: ConclusionsMap;
    emphasisMap: EmphasisMap;
    outlineMd: string;
  },
): Promise<void> {
  const attemptId = await upsertConclusionAttemptDraft(
    client,
    userId,
    itemId,
    patch,
  );
  const { error } = await client
    .from("case_conclusion_attempts")
    .update({ submitted_at: new Date().toISOString() })
    .eq("attempt_id", attemptId)
    .is("submitted_at", null);
  if (error) throw error;
}

export async function selfCheckConclusionAttempt(
  client: Client,
  userId: string,
  itemId: string,
  selfCheck: ConclusionSelfCheck,
): Promise<void> {
  const { error } = await client
    .from("case_conclusion_attempts")
    .update({
      self_check: selfCheck as unknown as Database["public"]["Tables"]["case_conclusion_attempts"]["Update"]["self_check"],
      self_checked_at: new Date().toISOString(),
      done_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function setConclusionAttemptAiAnalysis(
  client: Client,
  userId: string,
  itemId: string,
  analysis: ConclusionAiAnalysis,
): Promise<void> {
  const { error } = await client
    .from("case_conclusion_attempts")
    .update({
      ai_analysis: analysis as unknown as Database["public"]["Tables"]["case_conclusion_attempts"]["Update"]["ai_analysis"],
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function resetConclusionAttempt(
  client: Client,
  userId: string,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("case_conclusion_attempts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (error) throw error;
}

/** 학생 응시 가능한지 게이트 — item approved + 결론 정보 있는 쟁점 ≥ 2. */
export async function isConclusionTrainingReady(
  client: Client,
  itemId: string,
): Promise<boolean> {
  const { data: it } = await client
    .from("case_training_items")
    .select("review_status, deleted_at")
    .eq("item_id", itemId)
    .maybeSingle();
  if (!it || it.review_status !== "approved" || it.deleted_at !== null)
    return false;
  const { count } = await client
    .from("case_training_issues")
    .select("issue_id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .not("model_conclusion_direction", "is", null);
  return (count ?? 0) >= 2;
}

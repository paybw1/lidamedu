// 논점 (gs_question_issues) CRUD + 승인 가드.
// 학생 노출은 review_status='approved' AND deleted_at IS NULL 만 — 서버 재검증.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type IssueImportance = "core" | "side";
export type IssueReviewStatus = "draft" | "approved" | "rejected";

export interface QuestionIssue {
  issueId: string;
  gsQuestionId: string | null;
  problemId: string | null;
  label: string;
  descriptionMd: string | null;
  importance: IssueImportance;
  refArticleId: string | null;
  refCaseId: string | null;
  refHint: string | null;
  orderIndex: number;
  reviewStatus: IssueReviewStatus;
  generatedBy: "ai" | "staff";
  generatedAt: string;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

const ISSUE_COLUMNS =
  "issue_id, gs_question_id, problem_id, label, description_md, importance, ref_article_id, ref_case_id, ref_hint, order_index, review_status, generated_by, generated_at, approved_at, rejected_reason, created_at, updated_at";

type IssueRow = Database["public"]["Tables"]["gs_question_issues"]["Row"];

function rowToIssue(r: IssueRow): QuestionIssue {
  return {
    issueId: r.issue_id,
    gsQuestionId: r.gs_question_id,
    problemId: r.problem_id,
    label: r.label,
    descriptionMd: r.description_md,
    importance: r.importance as IssueImportance,
    refArticleId: r.ref_article_id,
    refCaseId: r.ref_case_id,
    refHint: r.ref_hint,
    orderIndex: r.order_index,
    reviewStatus: r.review_status as IssueReviewStatus,
    generatedBy: r.generated_by as "ai" | "staff",
    generatedAt: r.generated_at,
    approvedAt: r.approved_at,
    rejectedReason: r.rejected_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 회차 단위 — staff 큐. 모든 status. */
export async function listIssuesForRoundStaff(
  client: SupabaseClient<Database>,
  roundId: string,
): Promise<{
  byQuestion: Record<string, QuestionIssue[]>;
  draftCount: Record<string, number>;
  approvedCount: Record<string, number>;
  rejectedCount: Record<string, number>;
}> {
  const { data: questions } = await client
    .from("gs_questions")
    .select("question_id")
    .eq("round_id", roundId);
  const qIds = (questions ?? []).map((q) => q.question_id);
  if (qIds.length === 0) {
    return {
      byQuestion: {},
      draftCount: {},
      approvedCount: {},
      rejectedCount: {},
    };
  }
  const { data, error } = await client
    .from("gs_question_issues")
    .select(ISSUE_COLUMNS)
    .in("gs_question_id", qIds)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });
  if (error) throw error;
  const byQuestion: Record<string, QuestionIssue[]> = {};
  const draftCount: Record<string, number> = {};
  const approvedCount: Record<string, number> = {};
  const rejectedCount: Record<string, number> = {};
  for (const row of (data ?? []) as IssueRow[]) {
    const issue = rowToIssue(row);
    const qid = issue.gsQuestionId;
    if (!qid) continue;
    (byQuestion[qid] ??= []).push(issue);
    if (issue.reviewStatus === "draft") draftCount[qid] = (draftCount[qid] ?? 0) + 1;
    else if (issue.reviewStatus === "approved")
      approvedCount[qid] = (approvedCount[qid] ?? 0) + 1;
    else if (issue.reviewStatus === "rejected")
      rejectedCount[qid] = (rejectedCount[qid] ?? 0) + 1;
  }
  return { byQuestion, draftCount, approvedCount, rejectedCount };
}

/** 학생 진입용 — approved 만. */
export async function listApprovedIssuesForGsQuestion(
  client: SupabaseClient<Database>,
  gsQuestionId: string,
): Promise<QuestionIssue[]> {
  const { data, error } = await client
    .from("gs_question_issues")
    .select(ISSUE_COLUMNS)
    .eq("gs_question_id", gsQuestionId)
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as IssueRow[]).map(rowToIssue);
}

/**
 * §4 — 빠뜨린 논점의 ref_article_id / ref_case_id 를 deep link 가능한 형태로 lookup.
 * 결과: issueId → { article?: {lawCode, articleNumber, displayLabel}, case?: {lawCode, caseTitle} }
 * 학생이 결과 화면에서 클릭 시 학습 콘텐츠로 바로 진입할 수 있도록 메타 보강.
 */
export interface IssueRefLink {
  article?: {
    articleId: string;
    lawCode: string;
    articleNumber: string;
    displayLabel: string | null;
  };
  case?: {
    caseId: string;
    lawCode: string | null;
    caseTitle: string | null;
  };
}

export async function getRefLinksForIssues(
  client: SupabaseClient<Database>,
  issues: QuestionIssue[],
): Promise<Record<string, IssueRefLink>> {
  const articleIds = issues
    .map((i) => i.refArticleId)
    .filter((v): v is string => !!v);
  const caseIds = issues
    .map((i) => i.refCaseId)
    .filter((v): v is string => !!v);

  const articleMap = new Map<
    string,
    { lawCode: string; articleNumber: string; displayLabel: string | null }
  >();
  if (articleIds.length > 0) {
    const { data } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws(law_code)")
      .in("article_id", articleIds);
    for (const r of data ?? []) {
      const lawCode = r.laws?.law_code;
      if (!lawCode) continue;
      articleMap.set(r.article_id, {
        lawCode,
        articleNumber: r.article_number ?? "",
        displayLabel: r.display_label,
      });
    }
  }

  const caseMap = new Map<
    string,
    { lawCode: string | null; caseTitle: string | null }
  >();
  if (caseIds.length > 0) {
    const { data } = await client
      .from("cases")
      .select("case_id, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of data ?? []) {
      const firstLaw =
        Array.isArray(r.subject_laws) && r.subject_laws.length > 0
          ? String(r.subject_laws[0])
          : null;
      caseMap.set(r.case_id, {
        lawCode: firstLaw,
        caseTitle: r.case_title,
      });
    }
  }

  const result: Record<string, IssueRefLink> = {};
  for (const iss of issues) {
    const link: IssueRefLink = {};
    if (iss.refArticleId) {
      const a = articleMap.get(iss.refArticleId);
      if (a)
        link.article = {
          articleId: iss.refArticleId,
          lawCode: a.lawCode,
          articleNumber: a.articleNumber,
          displayLabel: a.displayLabel,
        };
    }
    if (iss.refCaseId) {
      const c = caseMap.get(iss.refCaseId);
      if (c)
        link.case = {
          caseId: iss.refCaseId,
          lawCode: c.lawCode,
          caseTitle: c.caseTitle,
        };
    }
    if (link.article || link.case) result[iss.issueId] = link;
  }
  return result;
}

interface InsertManyArgs {
  gsQuestionId: string;
  createdBy: string;
  startingOrderIndex: number;
  items: Array<{
    label: string;
    descriptionMd: string;
    importance: IssueImportance;
    refHint?: string;
  }>;
}

/**
 * AI 추출 결과를 draft 로 일괄 저장.
 * order_index = 기존 max+1 부터 시작.
 */
export async function insertDraftIssuesFromAi(
  client: SupabaseClient<Database>,
  args: InsertManyArgs,
): Promise<number> {
  if (args.items.length === 0) return 0;
  const rows = args.items.map((it, i) => ({
    gs_question_id: args.gsQuestionId,
    problem_id: null,
    label: it.label,
    description_md: it.descriptionMd,
    importance: it.importance,
    ref_hint: it.refHint ?? null,
    order_index: args.startingOrderIndex + i,
    review_status: "draft" as const,
    generated_by: "ai" as const,
    created_by: args.createdBy,
  }));
  const { error } = await client.from("gs_question_issues").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function getMaxOrderIndex(
  client: SupabaseClient<Database>,
  gsQuestionId: string,
): Promise<number> {
  const { data } = await client
    .from("gs_question_issues")
    .select("order_index")
    .eq("gs_question_id", gsQuestionId)
    .is("deleted_at", null)
    .order("order_index", { ascending: false })
    .limit(1);
  return (data ?? [])[0]?.order_index ?? -1;
}

export async function approveIssue(
  client: SupabaseClient<Database>,
  issueId: string,
  approverId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_question_issues")
    .update({
      review_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approverId,
      rejected_reason: null,
    })
    .eq("issue_id", issueId);
  if (error) throw error;
}

export async function rejectIssue(
  client: SupabaseClient<Database>,
  issueId: string,
  reason: string,
): Promise<void> {
  const { error } = await client
    .from("gs_question_issues")
    .update({
      review_status: "rejected",
      approved_at: null,
      approved_by: null,
      rejected_reason: reason.slice(0, 500),
    })
    .eq("issue_id", issueId);
  if (error) throw error;
}

interface UpdateIssueArgs {
  label?: string;
  descriptionMd?: string;
  importance?: IssueImportance;
  refArticleId?: string | null;
  refCaseId?: string | null;
  refHint?: string | null;
  orderIndex?: number;
}

export async function updateIssue(
  client: SupabaseClient<Database>,
  issueId: string,
  args: UpdateIssueArgs,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (args.label !== undefined) patch.label = args.label;
  if (args.descriptionMd !== undefined) patch.description_md = args.descriptionMd;
  if (args.importance !== undefined) patch.importance = args.importance;
  if (args.refArticleId !== undefined) patch.ref_article_id = args.refArticleId;
  if (args.refCaseId !== undefined) patch.ref_case_id = args.refCaseId;
  if (args.refHint !== undefined) patch.ref_hint = args.refHint;
  if (args.orderIndex !== undefined) patch.order_index = args.orderIndex;
  if (Object.keys(patch).length === 0) return;
  const { error } = await client
    .from("gs_question_issues")
    .update(patch)
    .eq("issue_id", issueId);
  if (error) throw error;
}

export async function softDeleteIssue(
  client: SupabaseClient<Database>,
  issueId: string,
): Promise<void> {
  const { error } = await client
    .from("gs_question_issues")
    .update({ deleted_at: new Date().toISOString() })
    .eq("issue_id", issueId);
  if (error) throw error;
}

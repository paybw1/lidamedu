// feat-2-029 후속 — 조문 빈칸 후보(article_blank_candidates) 승인 큐.
//   case-candidates.server 미러. 승인 = 승인자 '내 세트'(article_blank_sets) find-or-create 후
//   addBlankToSet(±80 hint 재사용) — 조문 빈칸의 강사별 세트 모델을 그대로 따른다.
//   되돌리기 = 승인 시 기록한 (approved_set_id, approved_blank_idx) 로 정확 제거.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import { addBlankToSet, removeBlankFromSet } from "./queries.server";

export type ArticleCandidateStatus = "pending" | "approved" | "rejected";

export interface ArticleBlankCandidateRow {
  candidateId: string;
  articleId: string;
  lawCode: string;
  articleNumber: string | null;
  articleLabel: string | null;
  answer: string;
  beforeContext: string | null;
  afterContext: string | null;
  sourceDisplayNo: number | null;
  sourceProblemId: string | null;
  falseStatement: string | null;
  rationale: string | null;
  status: ArticleCandidateStatus;
  createdAt: string;
}

type RawCandidate = {
  candidate_id: string;
  article_id: string;
  law_code: string;
  answer: string;
  before_context: string | null;
  after_context: string | null;
  source_display_no: number | null;
  source_problem_id: string | null;
  false_statement: string | null;
  rationale: string | null;
  status: string;
  created_at: string;
  approved_set_id: string | null;
  approved_blank_idx: number | null;
  articles: { article_number: string | null; display_label: string | null } | null;
};

const CANDIDATE_SELECT =
  "candidate_id, article_id, law_code, answer, before_context, after_context, source_display_no, source_problem_id, false_statement, rationale, status, created_at, approved_set_id, approved_blank_idx, articles!article_id(article_number, display_label)";

function rowToCandidate(r: RawCandidate): ArticleBlankCandidateRow {
  return {
    candidateId: r.candidate_id,
    articleId: r.article_id,
    lawCode: r.law_code,
    articleNumber: r.articles?.article_number ?? null,
    articleLabel: r.articles?.display_label ?? null,
    answer: r.answer,
    beforeContext: r.before_context,
    afterContext: r.after_context,
    sourceDisplayNo: r.source_display_no,
    sourceProblemId: r.source_problem_id,
    falseStatement: r.false_statement,
    rationale: r.rationale,
    status: (r.status === "approved" || r.status === "rejected"
      ? r.status
      : "pending") as ArticleCandidateStatus,
    createdAt: r.created_at,
  };
}

// 조문 자연 정렬 키 — "29의2" 같은 가지 번호 포함.
function articleSortKey(num: string | null): number {
  if (!num) return Number.MAX_SAFE_INTEGER;
  const m = /^(\d+)(?:의(\d+))?/.exec(num);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 1000 + Number(m[2] ?? 0);
}

export async function listArticleBlankCandidates(
  client: SupabaseClient<Database>,
  lawCode: string,
  status: ArticleCandidateStatus,
  limit = 600,
): Promise<ArticleBlankCandidateRow[]> {
  const { data, error } = await client
    .from("article_blank_candidates")
    .select(CANDIDATE_SELECT)
    .eq("law_code", lawCode)
    .eq("status", status)
    .order("article_id")
    .order("created_at")
    .limit(limit);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as RawCandidate[]).map(rowToCandidate);
  return rows.sort(
    (a, b) =>
      articleSortKey(a.articleNumber) - articleSortKey(b.articleNumber) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export async function countArticleBlankCandidates(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<Record<ArticleCandidateStatus, number>> {
  const count = async (status: ArticleCandidateStatus) => {
    const { count: n, error } = await client
      .from("article_blank_candidates")
      .select("candidate_id", { count: "exact", head: true })
      .eq("law_code", lawCode)
      .eq("status", status);
    if (error) throw error;
    return n ?? 0;
  };
  const [pending, approved, rejected] = await Promise.all([
    count("pending"),
    count("approved"),
    count("rejected"),
  ]);
  return { pending, approved, rejected };
}

type MutationResult = { ok: true } | { ok: false; error: string };

// 승인자 '내 세트' find-or-create — admin-add-blank 와 동일 규칙(adminClient, staff 게이트는 API).
async function findOrCreateOwnSet(
  articleId: string,
  ownerId: string,
): Promise<{ ok: true; setId: string } | { ok: false; error: string }> {
  const { data: existing } = await adminClient
    .from("article_blank_sets")
    .select("set_id")
    .eq("article_id", articleId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, setId: existing.set_id };
  const { data: inserted, error } = await adminClient
    .from("article_blank_sets")
    .insert({
      article_id: articleId,
      version: "기본",
      body_text: "",
      blanks: [] as never,
      importance: 0,
      owner_id: ownerId,
      display_name: null,
    })
    .select("set_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, setId: inserted.set_id };
}

export async function approveArticleCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
  reviewerId: string,
  editedAnswer?: string,
): Promise<MutationResult> {
  const { data: cand, error } = await client
    .from("article_blank_candidates")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!cand) return { ok: false, error: "후보를 찾을 수 없습니다." };
  if (cand.status === "approved")
    return { ok: false, error: "이미 승인된 후보입니다." };

  const answer = (editedAnswer ?? cand.answer).trim();
  if (!answer) return { ok: false, error: "빈칸 정답이 비어 있습니다." };

  const set = await findOrCreateOwnSet(cand.article_id, reviewerId);
  if (!set.ok) return set;

  // 위치 결정·verbatim 검증은 addBlankToSet 이 담당(±80 hint 로 occurrence 선택).
  const added = await addBlankToSet(client, set.setId, answer, {
    beforeHint: cand.before_context ?? undefined,
    afterHint: cand.after_context ?? undefined,
  });
  if (!added.ok) return { ok: false, error: added.reason };

  const { error: updErr } = await client
    .from("article_blank_candidates")
    .update({
      status: "approved",
      answer,
      approved_set_id: set.setId,
      approved_blank_idx: added.newIdx,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("candidate_id", candidateId);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}

export async function rejectArticleCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
  reviewerId: string,
): Promise<MutationResult> {
  const { error } = await client
    .from("article_blank_candidates")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("candidate_id", candidateId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 되돌리기 — approved 는 승인 시 기록한 세트/idx 로 blank 제거 후 pending 복귀.
export async function revertArticleCandidate(
  client: SupabaseClient<Database>,
  candidateId: string,
): Promise<MutationResult> {
  const { data: cand, error } = await client
    .from("article_blank_candidates")
    .select("status, approved_set_id, approved_blank_idx")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!cand) return { ok: false, error: "후보를 찾을 수 없습니다." };

  if (
    cand.status === "approved" &&
    cand.approved_set_id &&
    cand.approved_blank_idx != null
  ) {
    const removed = await removeBlankFromSet(
      client,
      cand.approved_set_id,
      cand.approved_blank_idx,
    );
    // "해당 빈칸 없음" = 이미 뷰어 등에서 지워짐 — pending 복귀는 계속.
    if (!removed.ok && removed.reason !== "해당 빈칸 없음")
      return { ok: false, error: removed.reason };
  }
  const { error: updErr } = await client
    .from("article_blank_candidates")
    .update({
      status: "pending",
      approved_set_id: null,
      approved_blank_idx: null,
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq("candidate_id", candidateId);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}

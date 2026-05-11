// 논문(papers) 서버 쿼리. RLS: 모든 사용자 read, staff (instructor/admin) write.
// 타입은 ./labels 에 정의 — 클라이언트 번들 안전 import.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type {
  PaperListItem,
  PaperRelatedArticleChip,
  PaperRelatedCaseChip,
  PaperWithLinks,
} from "./labels";

export type {
  PaperListItem,
  PaperRelatedArticleChip,
  PaperRelatedCaseChip,
  PaperWithLinks,
} from "./labels";

const LIST_COLUMNS =
  "paper_id, title, authors, source, published_at, abstract, url, pdf_url, subject_laws, importance, tags, created_at, updated_at";

interface PaperRow {
  paper_id: string;
  title: string;
  authors: string | null;
  source: string | null;
  published_at: string | null;
  abstract: string | null;
  url: string | null;
  pdf_url: string | null;
  subject_laws: string[];
  importance: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function isLawSubjectSlug(value: string): value is LawSubjectSlug {
  return (LAW_SUBJECT_SLUGS as readonly string[]).includes(value);
}

function rowToListItem(row: PaperRow): PaperListItem {
  return {
    paperId: row.paper_id,
    title: row.title,
    authors: row.authors,
    source: row.source,
    publishedAt: row.published_at,
    abstract: row.abstract,
    url: row.url,
    pdfUrl: row.pdf_url,
    subjectLaws: row.subject_laws.filter(isLawSubjectSlug),
    importance: row.importance ?? 1,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListPapersOptions {
  query?: string;
  subject?: LawSubjectSlug;
  importantOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaperListPage {
  items: PaperListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listPapers(
  client: SupabaseClient<Database>,
  options: ListPapersOptions = {},
): Promise<PaperListPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = client
    .from("papers")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
  if (options.subject) q = q.contains("subject_laws", [options.subject]);
  if (options.importantOnly) q = q.gte("importance", 3);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `title.ilike.${pattern},authors.ilike.${pattern},source.ilike.${pattern},abstract.ilike.${pattern}`,
    );
  }
  const { data, error, count } = await q
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    items: (data ?? []).map((r) => rowToListItem(r as PaperRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getPaperById(
  client: SupabaseClient<Database>,
  paperId: string,
): Promise<PaperListItem | null> {
  const { data, error } = await client
    .from("papers")
    .select(LIST_COLUMNS)
    .eq("paper_id", paperId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToListItem(data as PaperRow);
}

// 여러 논문의 관련 chip을 한 번에 가져온다 — N+1 회피.
export async function getRelatedChipsForPapers(
  client: SupabaseClient<Database>,
  paperIds: readonly string[],
): Promise<{
  byPaperArticles: Record<string, PaperRelatedArticleChip[]>;
  byPaperCases: Record<string, PaperRelatedCaseChip[]>;
}> {
  if (paperIds.length === 0) {
    return { byPaperArticles: {}, byPaperCases: {} };
  }

  // 조문 링크 + 조문 메타.
  const [{ data: articleLinks, error: aErr }, { data: caseLinks, error: cErr }] =
    await Promise.all([
      client
        .from("paper_article_links")
        .select(
          "paper_id, article_id, articles!inner(article_id, article_number, display_label, law_id, laws!inner(law_code))",
        )
        .in("paper_id", paperIds),
      client
        .from("paper_case_links")
        .select(
          "paper_id, case_id, cases!inner(case_id, case_number, case_title, summary_title, subject_laws)",
        )
        .in("paper_id", paperIds),
    ]);
  if (aErr) throw aErr;
  if (cErr) throw cErr;

  const byPaperArticles: Record<string, PaperRelatedArticleChip[]> = {};
  for (const row of articleLinks ?? []) {
    const a = row.articles;
    if (!a) continue;
    const lawCode = a.laws?.law_code;
    if (!lawCode || !isLawSubjectSlug(lawCode)) continue;
    const chip: PaperRelatedArticleChip = {
      articleId: a.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
      lawCode,
    };
    const list = byPaperArticles[row.paper_id] ?? [];
    list.push(chip);
    byPaperArticles[row.paper_id] = list;
  }

  const byPaperCases: Record<string, PaperRelatedCaseChip[]> = {};
  for (const row of caseLinks ?? []) {
    const c = row.cases;
    if (!c) continue;
    const subj = (c.subject_laws ?? []).find(isLawSubjectSlug) ?? null;
    const chip: PaperRelatedCaseChip = {
      caseId: c.case_id,
      caseNumber: c.case_number,
      summaryTitle: c.summary_title,
      caseTitle: c.case_title,
      primarySubject: subj,
    };
    const list = byPaperCases[row.paper_id] ?? [];
    list.push(chip);
    byPaperCases[row.paper_id] = list;
  }

  return { byPaperArticles, byPaperCases };
}

export async function listPapersWithLinks(
  client: SupabaseClient<Database>,
  options: ListPapersOptions = {},
): Promise<PaperListPage & { items: PaperWithLinks[] }> {
  const page = await listPapers(client, options);
  const { byPaperArticles, byPaperCases } = await getRelatedChipsForPapers(
    client,
    page.items.map((p) => p.paperId),
  );
  return {
    ...page,
    items: page.items.map((p) => ({
      ...p,
      articles: byPaperArticles[p.paperId] ?? [],
      cases: byPaperCases[p.paperId] ?? [],
    })),
  };
}

// ---- 변경(create/update/delete) ----
export interface UpsertPaperInput {
  title: string;
  authors?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  abstract?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  subjectLaws?: LawSubjectSlug[];
  importance?: number;
  tags?: string[];
}

export async function createPaper(
  client: SupabaseClient<Database>,
  input: UpsertPaperInput,
  authorId: string,
): Promise<{ ok: true; paperId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("papers")
    .insert({
      title: input.title,
      authors: input.authors ?? null,
      source: input.source ?? null,
      published_at: input.publishedAt ?? null,
      abstract: input.abstract ?? null,
      url: input.url ?? null,
      pdf_url: input.pdfUrl ?? null,
      subject_laws: input.subjectLaws ?? [],
      importance: input.importance ?? 1,
      tags: input.tags ?? [],
      created_by: authorId,
    })
    .select("paper_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, paperId: data.paper_id };
}

export async function updatePaper(
  client: SupabaseClient<Database>,
  paperId: string,
  patch: Partial<UpsertPaperInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.authors !== undefined) update.authors = patch.authors;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.abstract !== undefined) update.abstract = patch.abstract;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.pdfUrl !== undefined) update.pdf_url = patch.pdfUrl;
  if (patch.subjectLaws !== undefined) update.subject_laws = patch.subjectLaws;
  if (patch.importance !== undefined) update.importance = patch.importance;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("papers")
    .update(update)
    .eq("paper_id", paperId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Soft delete — deleted_at.
export async function deletePaper(
  client: SupabaseClient<Database>,
  paperId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("papers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("paper_id", paperId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- 링크 add/remove (article_number / case_number 기준) ----
export async function addPaperArticleLink(
  client: SupabaseClient<Database>,
  paperId: string,
  lawCode: LawSubjectSlug,
  articleNumber: string,
  authorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return { ok: false, error: "법 미존재" };
  const { data: article } = await client
    .from("articles")
    .select("article_id")
    .eq("law_id", law.law_id)
    .eq("article_number", articleNumber)
    .eq("level", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!article)
    return { ok: false, error: `제${articleNumber}조 조문 미존재` };
  const { error } = await client.from("paper_article_links").insert({
    paper_id: paperId,
    article_id: article.article_id,
    created_by: authorId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true }; // 이미 매핑
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removePaperArticleLink(
  client: SupabaseClient<Database>,
  paperId: string,
  articleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("paper_article_links")
    .delete()
    .eq("paper_id", paperId)
    .eq("article_id", articleId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function addPaperCaseLink(
  client: SupabaseClient<Database>,
  paperId: string,
  caseNumber: string,
  authorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // case_number 는 일반적으로 unique 하지 않을 수 있으나 (다른 법원의 같은 번호 등),
  // 입력 편의를 위해 가장 최근 선고일의 case 와 연결. 사용 시 안내.
  const { data: kase } = await client
    .from("cases")
    .select("case_id")
    .eq("case_number", caseNumber.trim())
    .is("deleted_at", null)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!kase) return { ok: false, error: `사건번호 "${caseNumber}" 미존재` };
  const { error } = await client.from("paper_case_links").insert({
    paper_id: paperId,
    case_id: kase.case_id,
    created_by: authorId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removePaperCaseLink(
  client: SupabaseClient<Database>,
  paperId: string,
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("paper_case_links")
    .delete()
    .eq("paper_id", paperId)
    .eq("case_id", caseId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

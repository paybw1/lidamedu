// 운영자 case ↔ article 매핑 도구 server queries.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface CaseMapperRow {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  summaryTitle: string | null;
  caseType: string | null;
  decidedAt: string;
  court: string;
  importance: number;
  linkCount: number;
  articleNumbers: string[]; // 표시용. unique sorted.
}

export interface CaseMapperPage {
  items: CaseMapperRow[];
  total: number;
  unmappedTotal: number;
  page: number;
  pageSize: number;
}

export interface ListCasesForMapperOptions {
  lawCode: LawSubjectSlug;
  query?: string;
  onlyUnmapped?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listCasesForMapper(
  client: SupabaseClient<Database>,
  options: ListCasesForMapperOptions,
): Promise<CaseMapperPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, options.pageSize ?? 50));

  // 1) cases 가져오기 (모든 매칭 후보).
  let q = client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, case_type, summary_title, importance, subject_laws",
      { count: "exact" },
    )
    .contains("subject_laws", [options.lawCode])
    .is("deleted_at", null);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `case_number.ilike.${pattern},case_title.ilike.${pattern},summary_title.ilike.${pattern}`,
    );
  }
  const { data: caseRows, error: caseErr, count: caseTotalCount } = await q
    .order("decided_at", { ascending: false })
    .limit(2000); // 카운트용 안전 상한.
  if (caseErr) throw caseErr;
  const allCases = caseRows ?? [];
  const caseTotal = caseTotalCount ?? allCases.length;

  // 2) 한 번에 article_case_links join (현재 페이지 후보 case_id 만).
  const caseIds = allCases.map((c) => c.case_id);
  const linksByCase = new Map<string, string[]>();
  if (caseIds.length > 0) {
    const { data: linkRows } = await client
      .from("article_case_links")
      .select("case_id, articles(article_number)")
      .in("case_id", caseIds);
    for (const r of linkRows ?? []) {
      const num = r.articles?.article_number;
      if (!num) continue;
      const arr = linksByCase.get(r.case_id) ?? [];
      arr.push(num);
      linksByCase.set(r.case_id, arr);
    }
  }

  // 3) row 매핑 + onlyUnmapped 필터 (post-filter).
  let rows: CaseMapperRow[] = allCases.map((c) => {
    const articleNumbers = Array.from(
      new Set(linksByCase.get(c.case_id) ?? []),
    ).sort((a, b) => Number(a.split("의")[0]) - Number(b.split("의")[0]));
    return {
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      summaryTitle: c.summary_title,
      caseType: c.case_type,
      decidedAt: c.decided_at,
      court: c.court,
      importance: c.importance ?? 1,
      linkCount: articleNumbers.length,
      articleNumbers,
    };
  });
  const unmappedTotal = rows.filter((r) => r.linkCount === 0).length;
  if (options.onlyUnmapped) {
    rows = rows.filter((r) => r.linkCount === 0);
  }
  // 매핑 없는 case 가 위로 오도록 정렬.
  rows.sort((a, b) => {
    if (a.linkCount === 0 && b.linkCount !== 0) return -1;
    if (a.linkCount !== 0 && b.linkCount === 0) return 1;
    return b.decidedAt.localeCompare(a.decidedAt);
  });

  const total = rows.length;
  const from = (page - 1) * pageSize;
  const items = rows.slice(from, from + pageSize);
  return { items, total, unmappedTotal, page, pageSize };
}

// 운영자 매핑 — article_number 기준 추가.
export async function addCaseArticleLink(
  client: SupabaseClient<Database>,
  caseId: string,
  lawCode: LawSubjectSlug,
  articleNumber: string,
  authorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) 해당 law + article_number → article_id.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return { ok: false, error: "law 미존재" };
  const { data: article } = await client
    .from("articles")
    .select("article_id")
    .eq("law_id", law.law_id)
    .eq("article_number", articleNumber)
    .eq("level", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!article) return { ok: false, error: `제${articleNumber}조 조문 미존재` };

  const { error } = await client.from("article_case_links").insert({
    article_id: article.article_id,
    case_id: caseId,
    relation_type: "directly_interprets",
    note: "운영자 수동 매핑",
    created_by: authorId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 매핑됨" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeCaseArticleLink(
  client: SupabaseClient<Database>,
  caseId: string,
  articleNumber: string,
  lawCode: LawSubjectSlug,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return { ok: false, error: "law 미존재" };
  const { data: article } = await client
    .from("articles")
    .select("article_id")
    .eq("law_id", law.law_id)
    .eq("article_number", articleNumber)
    .eq("level", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!article) return { ok: false, error: "조문 미존재" };

  const { error } = await client
    .from("article_case_links")
    .delete()
    .eq("case_id", caseId)
    .eq("article_id", article.article_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

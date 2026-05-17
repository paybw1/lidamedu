// 운영자 case ↔ article 매핑 도구 server queries.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { CaseCourt } from "~/features/cases/labels";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface CaseLinkChip {
  articleNumber: string;
  note: string | null;
}

export interface CaseMapperRow {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  summaryTitle: string | null;
  summaryFirstTitle: string | null;
  caseType: string | null;
  decidedAt: string;
  court: string;
  importance: number;
  linkCount: number;
  links: CaseLinkChip[]; // articleNumber + 출처 note
  articleNumbers: string[]; // 단순 number 셋 (client dedupe).
}

export interface CaseMapperPage {
  items: CaseMapperRow[];
  total: number;
  unmappedTotal: number;
  page: number;
  pageSize: number;
}

export type CaseMapperSort =
  | "unmapped_first"
  | "many_first"
  | "decided_desc"
  | "case_no";

export interface ListCasesForMapperOptions {
  lawCode: LawSubjectSlug;
  query?: string;
  court?: CaseCourt;
  yearFrom?: number;
  yearTo?: number;
  onlyUnmapped?: boolean;
  sort?: CaseMapperSort;
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
      "case_id, court, decided_at, case_number, case_title, case_type, summary_title, summary_items, importance, subject_laws",
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
  if (options.court) {
    q = q.eq("court", options.court);
  }
  // 선고연도 범위 — decided_at(date) 를 연 경계로 변환해 필터.
  if (options.yearFrom != null) {
    q = q.gte("decided_at", `${options.yearFrom}-01-01`);
  }
  if (options.yearTo != null) {
    q = q.lte("decided_at", `${options.yearTo}-12-31`);
  }
  const { data: caseRows, error: caseErr, count: caseTotalCount } = await q
    .order("decided_at", { ascending: false })
    .limit(2000); // 카운트용 안전 상한.
  if (caseErr) throw caseErr;
  const allCases = caseRows ?? [];
  const caseTotal = caseTotalCount ?? allCases.length;

  // 2) article_case_links + articles 를 2단계로 fetch.
  //    PostgREST 기본 max-rows(1000) 우회 — .range() 로 명시적 페이지네이션.
  const caseIds = allCases.map((c) => c.case_id);
  const linksByCase = new Map<string, CaseLinkChip[]>();
  if (caseIds.length > 0) {
    const allLinkRows: { case_id: string; article_id: string; note: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("article_case_links")
        .select("case_id, article_id, note")
        .in("case_id", caseIds)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) allLinkRows.push(r);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // 사용된 article_id 들 → article_number 매핑 (페이지네이션).
    const articleIds = Array.from(
      new Set(allLinkRows.map((r) => r.article_id).filter(Boolean)),
    );
    const articleNumberById = new Map<string, string>();
    if (articleIds.length > 0) {
      let af = 0;
      for (;;) {
        const slice = articleIds.slice(af, af + PAGE);
        if (slice.length === 0) break;
        const { data: artRows, error: artErr } = await client
          .from("articles")
          .select("article_id, article_number")
          .in("article_id", slice);
        if (artErr) throw artErr;
        for (const a of artRows ?? []) {
          if (a.article_number)
            articleNumberById.set(a.article_id, a.article_number);
        }
        af += PAGE;
      }
    }

    for (const r of allLinkRows) {
      const num = articleNumberById.get(r.article_id);
      if (!num) continue;
      const arr = linksByCase.get(r.case_id) ?? [];
      // 같은 article_number 가 여러 relation_type 으로 들어있을 수 있으나 표시 단위 1개로.
      if (arr.some((x) => x.articleNumber === num)) continue;
      arr.push({ articleNumber: num, note: r.note ?? null });
      linksByCase.set(r.case_id, arr);
    }
  }

  // 3) row 매핑 + onlyUnmapped 필터 (post-filter).
  let rows: CaseMapperRow[] = allCases.map((c) => {
    const links = (linksByCase.get(c.case_id) ?? []).slice().sort(
      (a, b) =>
        Number(a.articleNumber.split("의")[0]) -
        Number(b.articleNumber.split("의")[0]),
    );
    const articleNumbers = links.map((x) => x.articleNumber);
    // summary_items[0].title — list 사건명 컬럼에서 우선 표시.
    let summaryFirstTitle: string | null = null;
    if (Array.isArray(c.summary_items) && c.summary_items.length > 0) {
      const first = c.summary_items[0] as Record<string, unknown> | null;
      const t = first && typeof first.title === "string" ? first.title.trim() : "";
      summaryFirstTitle = t.length > 0 ? t : null;
    }
    return {
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      summaryTitle: c.summary_title,
      summaryFirstTitle,
      caseType: c.case_type,
      decidedAt: c.decided_at,
      court: c.court,
      importance: c.importance ?? 1,
      linkCount: links.length,
      links,
      articleNumbers,
    };
  });
  const unmappedTotal = rows.filter((r) => r.linkCount === 0).length;
  if (options.onlyUnmapped) {
    rows = rows.filter((r) => r.linkCount === 0);
  }
  // 정렬.
  const sortMode: CaseMapperSort = options.sort ?? "unmapped_first";
  switch (sortMode) {
    case "many_first":
      rows.sort((a, b) => {
        if (b.linkCount !== a.linkCount) return b.linkCount - a.linkCount;
        return b.decidedAt.localeCompare(a.decidedAt);
      });
      break;
    case "decided_desc":
      rows.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
      break;
    case "case_no":
      rows.sort((a, b) => a.caseNumber.localeCompare(b.caseNumber));
      break;
    default:
      rows.sort((a, b) => {
        if (a.linkCount === 0 && b.linkCount !== 0) return -1;
        if (a.linkCount !== 0 && b.linkCount === 0) return 1;
        return b.decidedAt.localeCompare(a.decidedAt);
      });
  }

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
  if (!article)
    return {
      ok: false,
      error: `${articleDisplayPrefix(articleNumber)} 조문 미존재`,
    };

  const { error } = await client.from("article_case_links").insert({
    article_id: article.article_id,
    case_id: caseId,
    relation_type: "directly_interprets",
    note: "운영자 수동 매핑",
    created_by: authorId,
  });
  if (error) {
    // UNIQUE 위배 = 이미 동일 페어가 존재. 사용자 의도(매핑 보장)는 충족된 상태이므로
    // silent success — UI 가 revalidate 로 chip 영역 갱신만 수행.
    if (error.code === "23505") return { ok: true };
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

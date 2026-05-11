// 조문 단위 연관관계 일괄 편집 (feat-7-008).
// 한 article 의 view: 관련 판례 + primary 문제 + 판례 경유 문제.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getLawByCode } from "~/features/laws/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface ArticleRelationsHeader {
  articleId: string;
  articleNumber: string;
  displayLabel: string;
  importance: number;
}

export interface LinkedCaseRow {
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  importance: number;
  decidedAt: string | null;
  relationType: string | null;
}

export interface LinkedProblemRow {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  bodySnippet: string;
  format: string;
  via: "primary" | "case";
  viaCaseNumber?: string;
}

export interface ArticleRelationsResult {
  lawCode: LawSubjectSlug;
  article: ArticleRelationsHeader;
  cases: LinkedCaseRow[];
  problems: LinkedProblemRow[];
}

export async function getArticleRelations(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  articleNumber: string,
): Promise<ArticleRelationsResult | null> {
  const law = await getLawByCode(client, lawCode);
  if (!law) return null;

  const { data: article } = await client
    .from("articles")
    .select("article_id, article_number, display_label, importance")
    .eq("law_id", law.lawId)
    .eq("article_number", articleNumber)
    .eq("level", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!article) return null;
  const articleId = article.article_id;

  // 1. 관련 판례.
  const { data: caseLinks } = await client
    .from("article_case_links")
    .select(
      "relation_type, cases!inner(case_id, case_number, case_title, importance, decided_at, deleted_at)",
    )
    .eq("article_id", articleId);
  const cases: LinkedCaseRow[] = (caseLinks ?? [])
    .filter((r) => r.cases && r.cases.deleted_at === null)
    .map((r) => {
      const c = r.cases!;
      return {
        caseId: c.case_id,
        caseNumber: c.case_number,
        caseTitle: c.case_title,
        importance: c.importance ?? 0,
        decidedAt: c.decided_at,
        relationType: r.relation_type,
      };
    });

  // 2. primary 문제.
  const { data: primaryProbs } = await client
    .from("problems")
    .select("problem_id, year, problem_number, body_md, format")
    .eq("primary_article_id", articleId)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true })
    .limit(200);

  // 3. 판례 경유 문제 (problem_case_links).
  const caseIds = cases.map((c) => c.caseId);
  let viaCaseProblems: LinkedProblemRow[] = [];
  if (caseIds.length > 0) {
    const { data: pcRows } = await client
      .from("problem_case_links")
      .select(
        "case_id, cases!inner(case_number), problems!inner(problem_id, year, problem_number, body_md, format, deleted_at)",
      )
      .in("case_id", caseIds);
    const primaryIds = new Set((primaryProbs ?? []).map((p) => p.problem_id));
    viaCaseProblems = (pcRows ?? [])
      .filter(
        (r) =>
          r.problems &&
          r.problems.deleted_at === null &&
          !primaryIds.has(r.problems.problem_id),
      )
      .map((r) => {
        const p = r.problems!;
        return {
          problemId: p.problem_id,
          year: p.year,
          problemNumber: p.problem_number,
          bodySnippet: (p.body_md ?? "").slice(0, 120),
          format: p.format,
          via: "case" as const,
          viaCaseNumber: r.cases?.case_number,
        };
      });
  }

  const primaryRows: LinkedProblemRow[] = (primaryProbs ?? []).map((p) => ({
    problemId: p.problem_id,
    year: p.year,
    problemNumber: p.problem_number,
    bodySnippet: (p.body_md ?? "").slice(0, 120),
    format: p.format,
    via: "primary" as const,
  }));

  return {
    lawCode,
    article: {
      articleId,
      articleNumber: article.article_number!,
      displayLabel: article.display_label,
      importance: article.importance ?? 0,
    },
    cases,
    problems: [...primaryRows, ...viaCaseProblems],
  };
}

// 판례 검색 — 사건번호 prefix / 제목 substring (관련 추가용).
export async function searchCasesForLink(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  query: string,
  limit = 20,
): Promise<
  {
    caseId: string;
    caseNumber: string;
    caseTitle: string | null;
    importance: number;
  }[]
> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replaceAll("%", "")}%`;
  const { data, error } = await client
    .from("cases")
    .select("case_id, case_number, case_title, importance, subject_laws")
    .or(`case_number.ilike.${pattern},case_title.ilike.${pattern}`)
    .is("deleted_at", null)
    .contains("subject_laws", [lawCode])
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((c) => ({
    caseId: c.case_id,
    caseNumber: c.case_number,
    caseTitle: c.case_title,
    importance: c.importance ?? 0,
  }));
}

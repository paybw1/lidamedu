// 운영자 — 미배정 자료 조회 (D-10).
// 1. 체계도에 미매핑된 조문 (article_systematic_links 누락)
// 2. 조문 매핑 없는 판례 (article_case_links 누락) + 문제 매핑 없는 판례
// 3. primary_article_id 가 없는 문제 (또는 lawCode 별 article 에 없음)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface UnmappedArticle {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
}

export interface UnmappedCase {
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  importance: number;
  decidedAt: string | null;
}

export interface UnmappedProblem {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  bodySnippet: string;
  format: string;
}

export interface RelationGapsResult {
  lawCode: LawSubjectSlug;
  unmappedArticles: UnmappedArticle[];
  unmappedCases: UnmappedCase[];
  unmappedProblems: UnmappedProblem[];
}

export async function getRelationGaps(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  limit = 100,
): Promise<RelationGapsResult> {
  // 1. law 조회.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) {
    return {
      lawCode,
      unmappedArticles: [],
      unmappedCases: [],
      unmappedProblems: [],
    };
  }
  const lawId = law.law_id;

  // 2. 모든 article + 매핑된 article.
  const [articlesRes, mappedRes] = await Promise.all([
    client
      .from("articles")
      .select("article_id, article_number, display_label, level")
      .eq("law_id", lawId)
      .eq("level", "article")
      .is("deleted_at", null),
    client
      .from("article_systematic_links")
      .select("article_id, systematic_nodes!inner(law_code)")
      .eq("systematic_nodes.law_code", lawCode),
  ]);
  const allArticles = articlesRes.data ?? [];
  const mappedSet = new Set(
    (mappedRes.data ?? []).map((r) => r.article_id),
  );
  const unmappedArticles: UnmappedArticle[] = allArticles
    .filter((a) => !mappedSet.has(a.article_id))
    .slice(0, limit)
    .map((a) => ({
      articleId: a.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
    }));

  // 3. 조문 매핑 없는 판례 — 본 과목(subject_laws contains lawCode) 인 판례 중
  //    article_case_links 가 하나도 없는 것.
  const { data: caseRows } = await client
    .from("cases")
    .select(
      "case_id, case_number, case_title, importance, decided_at, subject_laws",
    )
    .is("deleted_at", null)
    .contains("subject_laws", [lawCode]);
  const allCaseIds = (caseRows ?? []).map((c) => c.case_id);
  const linkedCaseIds = new Set<string>();
  if (allCaseIds.length > 0) {
    const { data: linkRows } = await client
      .from("article_case_links")
      .select("case_id")
      .in("case_id", allCaseIds);
    for (const r of linkRows ?? []) linkedCaseIds.add(r.case_id);
  }
  const unmappedCases: UnmappedCase[] = (caseRows ?? [])
    .filter((c) => !linkedCaseIds.has(c.case_id))
    .slice(0, limit)
    .map((c) => ({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      importance: c.importance ?? 0,
      decidedAt: c.decided_at,
    }));

  // 4. primary_article_id 가 없는 문제 — 같은 law 의 문제 한정.
  const { data: probRows } = await client
    .from("problems")
    .select("problem_id, year, problem_number, body_md, format")
    .eq("law_id", lawId)
    .is("primary_article_id", null)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true })
    .limit(limit);
  const unmappedProblems: UnmappedProblem[] = (probRows ?? []).map((p) => ({
    problemId: p.problem_id,
    year: p.year,
    problemNumber: p.problem_number,
    bodySnippet: (p.body_md ?? "").slice(0, 120),
    format: p.format,
  }));

  return { lawCode, unmappedArticles, unmappedCases, unmappedProblems };
}

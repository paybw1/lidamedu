// 한 법령의 콘텐츠 완성도 진단 — 운영자 갭 분석.
// SQL 정의: 마이그레이션 admin_law_completeness_rpc.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface LawCompletenessSnapshot {
  totalArticles: number;
  articlesNoRevision: number;
  articlesNoBlanks: number;
  articlesNoComments: number;
  articlesNoRelatedArticle: number;
  articlesNoRelatedCase: number;
  articlesNoProblem: number;
  totalCases: number;
  casesNoArticleLink: number;
  casesNoSummary: number;
  totalMcq: number;
  totalSubjective: number;
  mcqNoExplanation: number;
}

export async function getLawCompleteness(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<LawCompletenessSnapshot> {
  const { data, error } = await client.rpc("admin_law_completeness", {
    p_law_code: lawCode,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) {
    return {
      totalArticles: 0,
      articlesNoRevision: 0,
      articlesNoBlanks: 0,
      articlesNoComments: 0,
      articlesNoRelatedArticle: 0,
      articlesNoRelatedCase: 0,
      articlesNoProblem: 0,
      totalCases: 0,
      casesNoArticleLink: 0,
      casesNoSummary: 0,
      totalMcq: 0,
      totalSubjective: 0,
      mcqNoExplanation: 0,
    };
  }
  return {
    totalArticles: Number(row.total_articles),
    articlesNoRevision: Number(row.articles_no_revision),
    articlesNoBlanks: Number(row.articles_no_blanks),
    articlesNoComments: Number(row.articles_no_comments),
    articlesNoRelatedArticle: Number(row.articles_no_related_article),
    articlesNoRelatedCase: Number(row.articles_no_related_case),
    articlesNoProblem: Number(row.articles_no_problem),
    totalCases: Number(row.total_cases),
    casesNoArticleLink: Number(row.cases_no_article_link),
    casesNoSummary: Number(row.cases_no_summary),
    totalMcq: Number(row.total_mcq),
    totalSubjective: Number(row.total_subjective),
    mcqNoExplanation: Number(row.mcq_no_explanation),
  };
}

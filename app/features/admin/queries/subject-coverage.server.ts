// 5과목 시드 진행률 — 운영자 허브 상단.
// SQL 정의: 마이그레이션 admin_subject_coverage_rpc.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface SubjectCoverageRow {
  lawCode: LawSubjectSlug;
  displayLabel: string;
  articles: number; // level='article' 기준
  articlesWithBody: number;
  cases: number;
  problemsMc: number;
  problemsSubjective: number;
  articleComments: number;
  blankSets: number;
  systematicNodes: number;
  revisionsPublished: number;
}

export async function getSubjectCoverage(
  client: SupabaseClient<Database>,
): Promise<SubjectCoverageRow[]> {
  const { data, error } = await client.rpc("admin_subject_coverage");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    lawCode: row.law_code as LawSubjectSlug,
    displayLabel: row.display_label,
    articles: Number(row.articles),
    articlesWithBody: Number(row.articles_with_body),
    cases: Number(row.cases),
    problemsMc: Number(row.problems_mc),
    problemsSubjective: Number(row.problems_subjective),
    articleComments: Number(row.article_comments),
    blankSets: Number(row.blank_sets),
    systematicNodes: Number(row.systematic_nodes),
    revisionsPublished: Number(row.revisions_published),
  }));
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type {
  AaRelationType,
  AcRelationType,
  RelatedCase,
  RelatedArticle,
} from "./labels";
export { AA_RELATION_LABEL, AC_RELATION_LABEL } from "./labels";

import type {
  AaRelationType,
  RelatedCase,
  RelatedArticle,
} from "./labels";

export async function getRelatedCasesByArticle(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<RelatedCase[]> {
  const { data, error } = await client
    .from("article_case_links")
    .select(
      "relation_type, note, cases(case_id, case_number, case_title, summary_title, decided_at, importance)",
    )
    .eq("article_id", articleId);

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.cases !== null)
    .map((row) => {
      const c = row.cases!;
      return {
        caseId: c.case_id,
        caseNumber: c.case_number,
        caseTitle: c.case_title,
        summaryTitle: c.summary_title,
        decidedAt: c.decided_at,
        importance: c.importance ?? 1,
        relationType: row.relation_type,
        note: row.note,
      };
    })
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}

export async function getRelatedArticlesByCase(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<RelatedArticle[]> {
  const { data, error } = await client
    .from("article_case_links")
    .select(
      "relation_type, note, articles(article_id, article_number, display_label, importance, path)",
    )
    .eq("case_id", caseId);

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.articles !== null)
    .map((row) => {
      const a = row.articles!;
      return {
        articleId: a.article_id,
        articleNumber: a.article_number,
        displayLabel: a.display_label,
        importance: a.importance ?? 1,
        relationType: row.relation_type,
        note: row.note,
      };
    });
}

export async function getRelatedArticlesByArticle(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<RelatedArticle[]> {
  // 무방향 정규화이므로 article_a 또는 article_b 양쪽에서 조회 후 union
  const [{ data: aSide, error: aErr }, { data: bSide, error: bErr }] =
    await Promise.all([
      client
        .from("article_article_links")
        .select(
          "relation_type, note, other:articles!article_article_links_article_b_fkey(article_id, article_number, display_label, importance)",
        )
        .eq("article_a", articleId),
      client
        .from("article_article_links")
        .select(
          "relation_type, note, other:articles!article_article_links_article_a_fkey(article_id, article_number, display_label, importance)",
        )
        .eq("article_b", articleId),
    ]);

  if (aErr) throw aErr;
  if (bErr) throw bErr;

  const merge = (
    rows: { relation_type: AaRelationType; note: string | null; other: { article_id: string; article_number: string | null; display_label: string; importance: number | null } | null }[],
  ): RelatedArticle[] =>
    rows
      .filter((r) => r.other !== null)
      .map((r) => {
        const o = r.other!;
        return {
          articleId: o.article_id,
          articleNumber: o.article_number,
          displayLabel: o.display_label,
          importance: o.importance ?? 1,
          relationType: r.relation_type,
          note: r.note,
        };
      });

  const out = [...merge(aSide ?? []), ...merge(bSide ?? [])];
  out.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  return out;
}

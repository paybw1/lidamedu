import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type ArticleLevel = Database["public"]["Enums"]["article_level"];

export interface LawHeader {
  lawId: string;
  lawCode: string;
  displayLabel: string;
  shortLabel: string;
}

export interface ArticleNode {
  articleId: string;
  parentId: string | null;
  level: ArticleLevel;
  path: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  hasBody: boolean;
}

export async function getLawByCode(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<LawHeader | null> {
  const { data, error } = await client
    .from("laws")
    .select("law_id, law_code, display_label, short_label")
    .eq("law_code", lawCode)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    lawId: data.law_id,
    lawCode: data.law_code,
    displayLabel: data.display_label,
    shortLabel: data.short_label,
  };
}

export async function getArticleSkeleton(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<ArticleNode[]> {
  const { data, error } = await client
    .from("articles")
    .select(
      "article_id, parent_id, level, path, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .is("deleted_at", null)
    .order("path");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    articleId: row.article_id,
    parentId: row.parent_id,
    level: row.level,
    path: typeof row.path === "string" ? row.path : String(row.path ?? ""),
    articleNumber: row.article_number,
    displayLabel: row.display_label,
    importance: row.importance ?? 1,
    hasBody: row.current_revision_id !== null,
  }));
}

export interface ArticleDetail {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
  effectiveDate: string | null;
}

export async function getArticleByNumber(
  client: SupabaseClient<Database>,
  lawId: string,
  articleNumber: string,
): Promise<ArticleDetail | null> {
  const { data, error } = await client
    .from("articles")
    .select(
      "article_id, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .eq("article_number", articleNumber)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (!data.current_revision_id) {
    return {
      articleId: data.article_id,
      articleNumber: data.article_number,
      displayLabel: data.display_label,
      importance: data.importance ?? 1,
      bodyJson: null,
      effectiveDate: null,
    };
  }

  const { data: rev, error: revErr } = await client
    .from("article_revisions")
    .select("body_json, effective_date")
    .eq("revision_id", data.current_revision_id)
    .maybeSingle();
  if (revErr) throw revErr;

  return {
    articleId: data.article_id,
    articleNumber: data.article_number,
    displayLabel: data.display_label,
    importance: data.importance ?? 1,
    bodyJson: rev?.body_json ?? null,
    effectiveDate: rev?.effective_date ?? null,
  };
}

export async function getLatestPublishedRevisionDate(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("law_revisions")
    .select("effective_date")
    .eq("law_id", lawId)
    .eq("status", "published")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.effective_date ?? null;
}

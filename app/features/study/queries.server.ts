import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  AnnotationTargetType,
} from "~/features/annotations/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface StudyScope {
  subject: LawSubjectSlug;
  target_type: AnnotationTargetType;
  target_id: string;
  tab?: string;
}

export async function recordStudySession(
  client: SupabaseClient<Database>,
  userId: string,
  scope: StudyScope,
): Promise<void> {
  const { error } = await client.from("study_sessions").insert({
    user_id: userId,
    scope: scope as unknown as Database["public"]["Tables"]["study_sessions"]["Insert"]["scope"],
  });
  if (error) throw error;
}

export interface SubjectProgress {
  visitedArticleIds: Set<string>;
  totalArticleCount: number;
  pctViewed: number;
  lastVisited: {
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    visitedAt: string;
  } | null;
}

export async function getSubjectProgress(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
  totalArticleCount: number,
): Promise<SubjectProgress> {
  // 본인이 본 article 단위 study_sessions
  const { data, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const visited = new Set<string>();
  let last: SubjectProgress["lastVisited"] = null;
  for (const row of data ?? []) {
    const scope = row.scope as Partial<StudyScope> | null;
    if (!scope || scope.subject !== lawCode) continue;
    if (scope.target_type !== "article" || !scope.target_id) continue;
    visited.add(scope.target_id);
    if (!last) {
      last = {
        articleId: scope.target_id,
        articleNumber: null,
        displayLabel: "",
        visitedAt: row.started_at,
      };
    }
  }

  // last visited 의 displayLabel 채우기
  if (last) {
    const { data: a } = await client
      .from("articles")
      .select("article_number, display_label")
      .eq("article_id", last.articleId)
      .maybeSingle();
    if (a) {
      last.articleNumber = a.article_number;
      last.displayLabel = a.display_label;
    }
  }

  const pct =
    totalArticleCount > 0
      ? Math.round((visited.size / totalArticleCount) * 100)
      : 0;

  return {
    visitedArticleIds: visited,
    totalArticleCount,
    pctViewed: pct,
    lastVisited: last,
  };
}

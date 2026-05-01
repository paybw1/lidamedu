import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

// ───────── 학습자용 암기 모드 통계 ─────────

export interface RecitationRecentArticle {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  importance: number;
  totalAttempts: number;
  completedAttempts: number;
  bestSimilarity: number;
  lastAttemptedAt: string;
}

export interface RecitationWeakArticle {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  importance: number;
  attempts: number;
  bestSimilarity: number;
}

export interface UserRecitationStats {
  totalAttempts: number;
  completedAttempts: number;
  uniqueArticlesAttempted: number;
  uniqueArticlesCompleted: number;
  averageSimilarity: number;
  recentArticles: RecitationRecentArticle[];
  weakArticles: RecitationWeakArticle[];
}

export async function getUserRecitationStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserRecitationStats> {
  const { data: attempts, error } = await client
    .from("user_recitation_attempts")
    .select("article_id, similarity, is_complete, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const all = attempts ?? [];

  const totalAttempts = all.length;
  const completedAttempts = all.filter((a) => a.is_complete).length;
  const articleAttempts = new Map<string, number>();
  const articleCompleted = new Map<string, number>();
  const articleBestSim = new Map<string, number>();
  const articleLastAt = new Map<string, string>();
  let simSum = 0;

  for (const a of all) {
    const sim = Number(a.similarity);
    simSum += sim;
    articleAttempts.set(a.article_id, (articleAttempts.get(a.article_id) ?? 0) + 1);
    if (a.is_complete) {
      articleCompleted.set(
        a.article_id,
        (articleCompleted.get(a.article_id) ?? 0) + 1,
      );
    }
    const cur = articleBestSim.get(a.article_id) ?? 0;
    if (sim > cur) articleBestSim.set(a.article_id, sim);
    if (!articleLastAt.has(a.article_id))
      articleLastAt.set(a.article_id, a.attempted_at);
  }

  const uniqueArticlesAttempted = articleAttempts.size;
  const uniqueArticlesCompleted = articleCompleted.size;
  const averageSimilarity = totalAttempts > 0 ? simSum / totalAttempts : 0;

  const articleIds = [...articleAttempts.keys()];
  let recentArticles: RecitationRecentArticle[] = [];
  let weakArticles: RecitationWeakArticle[] = [];
  if (articleIds.length > 0) {
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number, display_label, importance, laws(law_code)")
      .in("article_id", articleIds);
    type ArticleRow = NonNullable<typeof rows>[number];
    const meta = new Map<string, ArticleRow>(
      (rows ?? []).map((r) => [r.article_id, r]),
    );
    const recentIds = [...articleLastAt.keys()].slice(0, 10);
    for (const aid of recentIds) {
      const m = meta.get(aid);
      if (!m) continue;
      recentArticles.push({
        articleId: aid,
        articleNumber: m.article_number,
        articleLabel: m.display_label,
        lawCode: m.laws?.law_code ?? "",
        importance: m.importance ?? 0,
        totalAttempts: articleAttempts.get(aid) ?? 0,
        completedAttempts: articleCompleted.get(aid) ?? 0,
        bestSimilarity: articleBestSim.get(aid) ?? 0,
        lastAttemptedAt: articleLastAt.get(aid) ?? "",
      });
    }
    recentArticles.sort(
      (a, b) =>
        new Date(b.lastAttemptedAt).getTime() -
        new Date(a.lastAttemptedAt).getTime(),
    );
    // 약점 — 시도했지만 best similarity < 0.9, 별 2개 이상 우선.
    const weakCandidates: RecitationWeakArticle[] = [];
    for (const aid of articleIds) {
      const best = articleBestSim.get(aid) ?? 0;
      if (best >= 0.9) continue;
      const m = meta.get(aid);
      if (!m) continue;
      weakCandidates.push({
        articleId: aid,
        articleNumber: m.article_number,
        articleLabel: m.display_label,
        lawCode: m.laws?.law_code ?? "",
        importance: m.importance ?? 0,
        attempts: articleAttempts.get(aid) ?? 0,
        bestSimilarity: best,
      });
    }
    weakCandidates.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return a.bestSimilarity - b.bestSimilarity;
    });
    weakArticles = weakCandidates.slice(0, 15);
  }

  return {
    totalAttempts,
    completedAttempts,
    uniqueArticlesAttempted,
    uniqueArticlesCompleted,
    averageSimilarity,
    recentArticles,
    weakArticles,
  };
}

// ───────── 운영자용 집계 통계 ─────────

export interface AdminRecitationTopArticle {
  articleId: string;
  articleNumber: string | null;
  articleLabel: string;
  lawCode: string;
  importance: number;
  attempts: number;
  completedAttempts: number;
  averageSimilarity: number;
}

export interface AdminRecitationStats {
  totalAttempts: number;
  completedAttempts: number;
  activeUsers: number;
  uniqueArticles: number;
  averageSimilarity: number;
  topTried: AdminRecitationTopArticle[];
  weakArticles: AdminRecitationTopArticle[];
}

export async function getAdminRecitationStats(
  client: SupabaseClient<Database>,
): Promise<AdminRecitationStats> {
  const { data: attempts, error } = await client
    .from("user_recitation_attempts")
    .select("user_id, article_id, similarity, is_complete")
    .order("attempted_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  const all = attempts ?? [];

  const totalAttempts = all.length;
  const completedAttempts = all.filter((a) => a.is_complete).length;
  const userSet = new Set<string>();
  const articleAttempts = new Map<string, number>();
  const articleCompleted = new Map<string, number>();
  const articleSimSum = new Map<string, number>();
  let simSum = 0;

  for (const a of all) {
    userSet.add(a.user_id);
    const sim = Number(a.similarity);
    simSum += sim;
    articleAttempts.set(a.article_id, (articleAttempts.get(a.article_id) ?? 0) + 1);
    articleSimSum.set(
      a.article_id,
      (articleSimSum.get(a.article_id) ?? 0) + sim,
    );
    if (a.is_complete) {
      articleCompleted.set(
        a.article_id,
        (articleCompleted.get(a.article_id) ?? 0) + 1,
      );
    }
  }
  const uniqueArticles = articleAttempts.size;
  const averageSimilarity = totalAttempts > 0 ? simSum / totalAttempts : 0;

  const articleIds = [...articleAttempts.keys()];
  if (articleIds.length === 0) {
    return {
      totalAttempts,
      completedAttempts,
      activeUsers: userSet.size,
      uniqueArticles,
      averageSimilarity,
      topTried: [],
      weakArticles: [],
    };
  }

  const { data: rows } = await client
    .from("articles")
    .select("article_id, article_number, display_label, importance, laws(law_code)")
    .in("article_id", articleIds);
  type ArticleRow = NonNullable<typeof rows>[number];
  const meta = new Map<string, ArticleRow>(
    (rows ?? []).map((r) => [r.article_id, r]),
  );

  const buildRow = (
    articleId: string,
  ): AdminRecitationTopArticle | null => {
    const m = meta.get(articleId);
    if (!m) return null;
    const att = articleAttempts.get(articleId) ?? 0;
    const sim = articleSimSum.get(articleId) ?? 0;
    return {
      articleId,
      articleNumber: m.article_number,
      articleLabel: m.display_label,
      lawCode: m.laws?.law_code ?? "",
      importance: m.importance ?? 0,
      attempts: att,
      completedAttempts: articleCompleted.get(articleId) ?? 0,
      averageSimilarity: att > 0 ? sim / att : 0,
    };
  };

  const sortedByTried = [...articleAttempts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);
  const topTried = sortedByTried
    .map(([aid]) => buildRow(aid))
    .filter((r): r is AdminRecitationTopArticle => r !== null);

  // 약점 — average similarity 낮은 article (시도 ≥ 3 인 것만).
  const weakCandidates = [...articleAttempts.entries()]
    .filter(([, att]) => att >= 3)
    .map(([aid]) => buildRow(aid))
    .filter((r): r is AdminRecitationTopArticle => r !== null)
    .sort((a, b) => a.averageSimilarity - b.averageSimilarity)
    .slice(0, 20);

  return {
    totalAttempts,
    completedAttempts,
    activeUsers: userSet.size,
    uniqueArticles,
    averageSimilarity,
    topTried,
    weakArticles: weakCandidates,
  };
}

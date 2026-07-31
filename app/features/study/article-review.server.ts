// feat-2-016 조문 정독 복습 — study_sessions 기반 passive SRS.
// 별도 테이블 없이 study_sessions(target_type='article') 의 visit_count + last_visit
// 으로 next_due_at 동적 계산.
//
// 정답/오답 신호가 없는 조문은 진정한 SRS 가 아니라 "방문 간격 기반 복습 알림" 모델.
// visit_count → interval 매핑:
//   1회 방문   → 7일 후
//   2회 방문   → 14일 후
//   3회 방문   → 30일 후
//   4회+       → 60일 후

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { reviewDueCutoffMs } from "~/features/study/lib/srs";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface DueArticleReviewItem {
  articleId: string;
  articleNumber: string;
  displayLabel: string;
  lawCode: LawSubjectSlug;
  visitCount: number;
  lastVisitedAt: string;
  intervalDays: number;
  /** 음수 = overdue. */
  daysUntilDue: number;
}

const INTERVAL_DAYS = [7, 14, 30, 60] as const;

function intervalForVisitCount(count: number): number {
  if (count <= 0) return 7;
  if (count >= INTERVAL_DAYS.length) return INTERVAL_DAYS[INTERVAL_DAYS.length - 1];
  return INTERVAL_DAYS[count - 1];
}

/** 본인의 조문 study_sessions 를 집계해 due 상태 산출. */
export async function getDueArticleReviews(
  client: SupabaseClient<Database>,
  userId: string,
  limit: number = 50,
): Promise<DueArticleReviewItem[]> {
  // study_sessions — article 방문 전체 fetch.
  const { data: sessions } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(20000);

  // article_id 별 (visit_count, last_visit).
  type Acc = { visitCount: number; lastVisitedAt: string };
  const byArticle = new Map<string, Acc>();
  for (const r of sessions ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type !== "article" || !sc.target_id) continue;
    const cur = byArticle.get(sc.target_id);
    if (!cur) {
      byArticle.set(sc.target_id, {
        visitCount: 1,
        lastVisitedAt: r.started_at,
      });
    } else {
      cur.visitCount += 1;
      if (r.started_at > cur.lastVisitedAt) cur.lastVisitedAt = r.started_at;
    }
  }

  const now = Date.now();
  const cutoff = reviewDueCutoffMs();
  // due 필터 + sort.
  const dueIds: string[] = [];
  const dueMap = new Map<
    string,
    {
      visitCount: number;
      lastVisitedAt: string;
      intervalDays: number;
      dueAtMs: number;
    }
  >();
  for (const [articleId, acc] of byArticle.entries()) {
    const interval = intervalForVisitCount(acc.visitCount);
    const dueAtMs = new Date(acc.lastVisitedAt).getTime() + interval * 86_400_000;
    if (dueAtMs <= cutoff) {
      dueIds.push(articleId);
      dueMap.set(articleId, {
        visitCount: acc.visitCount,
        lastVisitedAt: acc.lastVisitedAt,
        intervalDays: interval,
        dueAtMs,
      });
    }
  }
  if (dueIds.length === 0) return [];

  // 조문 메타 조회.
  const { data: articles } = await client
    .from("articles")
    .select(
      "article_id, article_number, display_label, laws!inner(law_code)",
    )
    .in("article_id", dueIds);

  const items: DueArticleReviewItem[] = [];
  for (const a of articles ?? []) {
    if (!a.article_number) continue;
    const meta = dueMap.get(a.article_id)!;
    items.push({
      articleId: a.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
      lawCode: (a.laws.law_code as LawSubjectSlug) ?? "patent",
      visitCount: meta.visitCount,
      lastVisitedAt: meta.lastVisitedAt,
      intervalDays: meta.intervalDays,
      daysUntilDue: Math.floor((meta.dueAtMs - now) / 86_400_000),
    });
  }
  // 가장 오래 overdue 먼저.
  items.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  return items.slice(0, limit);
}

export interface ArticleReviewCounts {
  due: number;
  upcoming7d: number;
  totalVisitedArticles: number;
}

export async function getArticleReviewCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ArticleReviewCounts> {
  const { data: sessions } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(20000);
  const byArticle = new Map<string, { visitCount: number; lastVisitedAt: string }>();
  for (const r of sessions ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type !== "article" || !sc.target_id) continue;
    const cur = byArticle.get(sc.target_id);
    if (!cur) {
      byArticle.set(sc.target_id, {
        visitCount: 1,
        lastVisitedAt: r.started_at,
      });
    } else {
      cur.visitCount += 1;
      if (r.started_at > cur.lastVisitedAt) cur.lastVisitedAt = r.started_at;
    }
  }
  const cutoff = reviewDueCutoffMs();
  const sevenDays = cutoff + 7 * 86_400_000;
  let due = 0;
  let upcoming = 0;
  for (const acc of byArticle.values()) {
    const interval = intervalForVisitCount(acc.visitCount);
    const dueAtMs = new Date(acc.lastVisitedAt).getTime() + interval * 86_400_000;
    if (dueAtMs <= cutoff) due += 1;
    else if (dueAtMs <= sevenDays) upcoming += 1;
  }
  return {
    due,
    upcoming7d: upcoming,
    totalVisitedArticles: byArticle.size,
  };
}

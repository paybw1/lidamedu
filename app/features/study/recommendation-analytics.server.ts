// feat-2-012 추천 실행률 분석.
// user_daily_recommendations 스냅샷의 각 item 이 그 날 이후 실제 학습 행동으로 이어졌는지 매칭.
// 슬롯별 / 일별 / 전체 완수율 통계.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  DailyMenuItem,
  DailyMenuKind,
} from "~/features/study/lib/daily-menu";

export interface DayCompletionRow {
  date: string;             // YYYY-MM-DD (KST)
  totalItems: number;       // 추천된 항목 수
  completedItems: number;   // 완수 판정된 항목 수
}

export interface KindCompletionRow {
  kind: DailyMenuKind;
  totalItems: number;
  completedItems: number;
  /** 0~1 비율. totalItems=0 일 땐 0. */
  rate: number;
}

export interface RecommendationCompletionSummary {
  daysAnalyzed: number;
  totalItems: number;
  totalCompleted: number;
  overallRate: number;
  byKind: KindCompletionRow[];
  byDay: DayCompletionRow[];
}

/**
 * 지난 N일간(KST 기준)의 추천 스냅샷을 각 슬롯별 완수 여부와 매칭해 통계 반환.
 * 완수 판정 규칙:
 *  - weak_problem: metadata.problemId 가 attempted_at >= rec_date 인 attempt 1+
 *  - weak_article: metadata.articleId 가 scope.target_type='article' 인 session 1+
 *  - unread_case:  metadata.caseId 가 scope.target_type='case' 인 session 1+
 *  - blank_due:    metadata.setId 의 user_blank_attempts 1+
 *  - gap_problems: metadata.problemIds 중 1+ 의 attempts (5개 모두 요구 안 함)
 */
export async function analyzeRecommendationCompletion(
  client: SupabaseClient<Database>,
  userId: string,
  daysBack: number = 14,
): Promise<RecommendationCompletionSummary> {
  // 1) 분석 대상 스냅샷 fetch.
  const startKst = kstDateMinus(daysBack);
  const { data: snapshots, error } = await client
    .from("user_daily_recommendations")
    .select("recommendation_date, items")
    .eq("user_id", userId)
    .gte("recommendation_date", startKst)
    .order("recommendation_date", { ascending: true });
  if (error) throw error;
  if (!snapshots || snapshots.length === 0) {
    return {
      daysAnalyzed: 0,
      totalItems: 0,
      totalCompleted: 0,
      overallRate: 0,
      byKind: [],
      byDay: [],
    };
  }

  // 2) 전체 분석 기간의 학습 활동 일괄 fetch.
  const sinceIso = kstDateToUtcIso(snapshots[0].recommendation_date);
  const [attemptsRes, sessionsRes, blankAttemptsRes] = await Promise.all([
    client
      .from("user_problem_attempts")
      .select("problem_id, attempted_at")
      .eq("user_id", userId)
      .gte("attempted_at", sinceIso)
      .limit(5000),
    client
      .from("study_sessions")
      .select("scope, started_at")
      .eq("user_id", userId)
      .gte("started_at", sinceIso)
      .limit(5000),
    client
      .from("user_blank_attempts")
      .select("set_id, attempted_at")
      .eq("user_id", userId)
      .gte("attempted_at", sinceIso)
      .limit(5000),
  ]);

  // 활동 인덱싱.
  const problemAttemptsByTs = (attemptsRes.data ?? []).map((r) => ({
    problemId: r.problem_id,
    ts: new Date(r.attempted_at).getTime(),
  }));
  const articleSessionsByTs: { articleId: string; ts: number }[] = [];
  const caseSessionsByTs: { caseId: string; ts: number }[] = [];
  for (const r of sessionsRes.data ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (!sc?.target_id) continue;
    const ts = new Date(r.started_at).getTime();
    if (sc.target_type === "article") {
      articleSessionsByTs.push({ articleId: sc.target_id, ts });
    } else if (sc.target_type === "case") {
      caseSessionsByTs.push({ caseId: sc.target_id, ts });
    }
  }
  const blankAttemptsByTs = (blankAttemptsRes.data ?? []).map((r) => ({
    setId: r.set_id,
    ts: new Date(r.attempted_at).getTime(),
  }));

  // 3) 슬롯별 / 일별 집계.
  const byKindMap = new Map<DailyMenuKind, { total: number; done: number }>();
  const byDayMap = new Map<string, { total: number; done: number }>();

  for (const snap of snapshots) {
    const items = (snap.items ?? []) as unknown as DailyMenuItem[];
    const recDateMs = new Date(
      kstDateToUtcIso(snap.recommendation_date),
    ).getTime();
    for (const item of items) {
      const isDone = checkItemCompletion(
        item,
        recDateMs,
        problemAttemptsByTs,
        articleSessionsByTs,
        caseSessionsByTs,
        blankAttemptsByTs,
      );
      const kindBucket = byKindMap.get(item.kind) ?? { total: 0, done: 0 };
      kindBucket.total += 1;
      if (isDone) kindBucket.done += 1;
      byKindMap.set(item.kind, kindBucket);

      const dayBucket = byDayMap.get(snap.recommendation_date) ?? {
        total: 0,
        done: 0,
      };
      dayBucket.total += 1;
      if (isDone) dayBucket.done += 1;
      byDayMap.set(snap.recommendation_date, dayBucket);
    }
  }

  // 4) 요약.
  const byKind: KindCompletionRow[] = [...byKindMap.entries()]
    .map(([kind, v]) => ({
      kind,
      totalItems: v.total,
      completedItems: v.done,
      rate: v.total > 0 ? v.done / v.total : 0,
    }))
    .sort((a, b) => b.totalItems - a.totalItems);

  const byDay: DayCompletionRow[] = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      totalItems: v.total,
      completedItems: v.done,
    }));

  const totalItems = byDay.reduce((s, d) => s + d.totalItems, 0);
  const totalCompleted = byDay.reduce((s, d) => s + d.completedItems, 0);

  return {
    daysAnalyzed: byDay.length,
    totalItems,
    totalCompleted,
    overallRate: totalItems > 0 ? totalCompleted / totalItems : 0,
    byKind,
    byDay,
  };
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function checkItemCompletion(
  item: DailyMenuItem,
  recDateMs: number,
  attempts: { problemId: string; ts: number }[],
  articleSessions: { articleId: string; ts: number }[],
  caseSessions: { caseId: string; ts: number }[],
  blankAttempts: { setId: string; ts: number }[],
): boolean {
  const meta = item.metadata;
  switch (item.kind) {
    case "weak_problem": {
      const pid = String(meta.problemId ?? "");
      return attempts.some((a) => a.problemId === pid && a.ts >= recDateMs);
    }
    case "weak_article": {
      const aid = String(meta.articleId ?? "");
      return articleSessions.some(
        (s) => s.articleId === aid && s.ts >= recDateMs,
      );
    }
    case "unread_case": {
      const cid = String(meta.caseId ?? "");
      return caseSessions.some((s) => s.caseId === cid && s.ts >= recDateMs);
    }
    case "blank_due": {
      const sid = String(meta.setId ?? "");
      return blankAttempts.some((b) => b.setId === sid && b.ts >= recDateMs);
    }
    case "gap_problems": {
      const ids = Array.isArray(meta.problemIds)
        ? (meta.problemIds as string[])
        : [];
      return attempts.some(
        (a) => ids.includes(a.problemId) && a.ts >= recDateMs,
      );
    }
    default:
      return false;
  }
}

/** N일 전의 KST 자정 = YYYY-MM-DD. */
function kstDateMinus(days: number): string {
  const ms = Date.now() - days * 86_400_000 + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD (KST 자정) → UTC ISO. */
function kstDateToUtcIso(yyyymmdd: string): string {
  // KST 자정 = UTC 15:00 전날.
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  return utc.toISOString();
}

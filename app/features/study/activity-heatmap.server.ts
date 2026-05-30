// feat-2-013 학습 활동 히트맵 — GitHub 잔디 + 요일/시간대 패턴.
// study_sessions + user_problem_attempts 시계열 집계 (KST).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface HeatmapCell {
  date: string;     // YYYY-MM-DD (KST)
  count: number;    // 그 날 학습 이벤트(session+attempt 합산)
}

export interface DowBucket {
  dow: number;          // 0=일, 1=월, ..., 6=토 (KST)
  totalCount: number;
  accuracyPct: number | null; // 해당 요일의 객관식 정답률
  attemptCount: number;
}

export interface HourBucket {
  hour: number;         // 0~23 (KST)
  totalCount: number;
  accuracyPct: number | null;
  attemptCount: number;
}

export interface ActivityHeatmapData {
  daysBack: number;
  cells: HeatmapCell[];           // 시간 순 (오래된 → 최근)
  totalEvents: number;
  activeDays: number;             // 이벤트 있는 날 수
  maxDayCount: number;            // 최대값 (intensity bucketing 기준)
  byDow: DowBucket[];             // 0~6, KST
  byHour: HourBucket[];           // 0~23, KST
  /** 가장 활동 많은 요일·시간대 자동 추출. */
  topDow: DowBucket | null;
  topHour: HourBucket | null;
}

const DAY_MS = 86_400_000;

/** 학습 활동 데이터 — daysBack 일 (기본 365). */
export async function getActivityHeatmap(
  client: SupabaseClient<Database>,
  userId: string,
  daysBack: number = 365,
): Promise<ActivityHeatmapData> {
  const sinceMs = Date.now() - daysBack * DAY_MS;
  const sinceIso = new Date(sinceMs).toISOString();

  const [sessionsRes, attemptsRes] = await Promise.all([
    client
      .from("study_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .gte("started_at", sinceIso)
      .limit(20000),
    client
      .from("user_problem_attempts")
      .select("attempted_at, is_correct")
      .eq("user_id", userId)
      .gte("attempted_at", sinceIso)
      .limit(20000),
  ]);

  const cellMap = new Map<string, number>();
  const dowAgg = Array.from({ length: 7 }, () => ({
    total: 0,
    correct: 0,
    attempts: 0,
  }));
  const hourAgg = Array.from({ length: 24 }, () => ({
    total: 0,
    correct: 0,
    attempts: 0,
  }));

  // sessions — 활동 카운트만.
  for (const r of sessionsRes.data ?? []) {
    const kst = toKst(r.started_at);
    cellMap.set(kst.dateKey, (cellMap.get(kst.dateKey) ?? 0) + 1);
    dowAgg[kst.dow].total += 1;
    hourAgg[kst.hour].total += 1;
  }
  // attempts — 활동 + 정답률.
  for (const r of attemptsRes.data ?? []) {
    const kst = toKst(r.attempted_at);
    cellMap.set(kst.dateKey, (cellMap.get(kst.dateKey) ?? 0) + 1);
    dowAgg[kst.dow].total += 1;
    dowAgg[kst.dow].attempts += 1;
    if (r.is_correct) dowAgg[kst.dow].correct += 1;
    hourAgg[kst.hour].total += 1;
    hourAgg[kst.hour].attempts += 1;
    if (r.is_correct) hourAgg[kst.hour].correct += 1;
  }

  // 빈 날 채우기 — 연속된 daysBack 일 생성.
  const cells: HeatmapCell[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS + 9 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: cellMap.get(key) ?? 0 });
  }

  const totalEvents = cells.reduce((s, c) => s + c.count, 0);
  const activeDays = cells.filter((c) => c.count > 0).length;
  const maxDayCount = cells.reduce((m, c) => Math.max(m, c.count), 0);

  const byDow: DowBucket[] = dowAgg.map((v, i) => ({
    dow: i,
    totalCount: v.total,
    accuracyPct: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : null,
    attemptCount: v.attempts,
  }));
  const byHour: HourBucket[] = hourAgg.map((v, i) => ({
    hour: i,
    totalCount: v.total,
    accuracyPct: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : null,
    attemptCount: v.attempts,
  }));

  const topDow = byDow.reduce<DowBucket | null>(
    (best, b) => (!best || b.totalCount > best.totalCount ? b : best),
    null,
  );
  const topHour = byHour.reduce<HourBucket | null>(
    (best, b) => (!best || b.totalCount > best.totalCount ? b : best),
    null,
  );

  return {
    daysBack,
    cells,
    totalEvents,
    activeDays,
    maxDayCount,
    byDow,
    byHour,
    topDow: topDow && topDow.totalCount > 0 ? topDow : null,
    topHour: topHour && topHour.totalCount > 0 ? topHour : null,
  };
}

function toKst(iso: string): { dateKey: string; dow: number; hour: number } {
  const ms = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(ms);
  return {
    dateKey: d.toISOString().slice(0, 10),
    dow: d.getUTCDay(),
    hour: d.getUTCHours(),
  };
}

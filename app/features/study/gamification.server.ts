// feat-2-027 Phase 2 — 게임화 요약 서버. 레벨(파생: 마스터 단원 수) + 스트릭(주간·연속·최장).
// 표시값은 즉시 산출, 영속(longest·last_active·level_seen)은 runAfterResponse(응답 후 best-effort).
// user_gamification 은 "파생 불가 상태"만 저장 — 현재 스트릭/레벨 값은 매번 파생.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { runAfterResponse } from "~/core/lib/wait-until.server";

import { type LevelInfo, computeLevel } from "./lib/level";
import { computeProtectedStreak, thisWeekActiveDays } from "./lib/streak";
import { getDailyStudyStats } from "./queries.server";

const GAM_STREAK_WINDOW_DAYS = 120; // range 셀렉터와 무관한 안정 윈도우(스트릭용 별도 fetch).

export interface GamificationSummary {
  level: LevelInfo;
  leveledUp: boolean; // 마지막으로 본 단계보다 올라감 — 조용한 1회 알림
  thisWeekActiveDays: number;
  currentStreak: number;
  longestStreak: number;
}

export async function getGamificationSummary(
  client: SupabaseClient<Database>,
  userId: string,
  todayYmd: string,
  masteredCount: number,
): Promise<GamificationSummary> {
  const [rowRes, daily] = await Promise.all([
    client
      .from("user_gamification")
      .select(
        "longest_streak_days, last_active_date, level_seen, streak_freezes_remaining",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    getDailyStudyStats(client, userId, { daysBack: GAM_STREAK_WINDOW_DAYS }),
  ]);
  const row = rowRes.data;
  const freezes = row?.streak_freezes_remaining ?? 1;
  const week = thisWeekActiveDays(daily.days, todayYmd);
  const currentStreak = computeProtectedStreak(daily.days, freezes);
  const longestStreak = Math.max(row?.longest_streak_days ?? 0, currentStreak);
  const level = computeLevel(masteredCount);
  const leveledUp = level.levelNumber > (row?.level_seen ?? 1);

  const last = daily.days[daily.days.length - 1];
  const activeToday =
    !!last && last.date === todayYmd && last.attemptCount > 0;
  const lastActiveDate = activeToday
    ? todayYmd
    : (row?.last_active_date ?? null);

  // 영속은 응답 후(표시값은 위에서 이미 산출). longest·last_active·level_seen 갱신.
  runAfterResponse(
    (async () => {
      await client.from("user_gamification").upsert(
        {
          user_id: userId,
          longest_streak_days: longestStreak,
          last_active_date: lastActiveDate,
          level_seen: level.levelNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    })(),
  );

  return {
    level,
    leveledUp,
    thisWeekActiveDays: week,
    currentStreak,
    longestStreak,
  };
}

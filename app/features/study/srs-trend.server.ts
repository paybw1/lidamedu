// feat-2-020 SRS 처리 추이 — 최근 N일 일별 "신규 추가 vs 재처리" 집계.
// 3 종 SRS 테이블 (problem/blank/ox) 의 created_at / last_reviewed_at 기준.
// 신규 = created_at on day D, 재처리 = last_reviewed_at on day D AND created_at != day D.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface SrsTrendDay {
  date: string;       // YYYY-MM-DD (KST)
  added: number;      // 신규 SRS 항목
  reviewed: number;   // 재처리 (이미 SRS 큐에 있던 항목 재학습)
}

export interface SrsTrend {
  daysBack: number;
  days: SrsTrendDay[];                  // 오래된 → 최근
  totalAdded: number;
  totalReviewed: number;
  /** 최근 7일 추가/처리 평균 (학습 강도 지표). */
  avg7dAdded: number;
  avg7dReviewed: number;
}

const DAY_MS = 86_400_000;

export async function getSrsTrend(
  client: SupabaseClient<Database>,
  userId: string,
  daysBack: number = 30,
): Promise<SrsTrend> {
  const sinceMs = Date.now() - daysBack * DAY_MS;
  const sinceIso = new Date(sinceMs).toISOString();

  // 3 종 SRS 테이블 created_at + last_reviewed_at 가져오기.
  const [problemRes, blankRes, oxRes] = await Promise.all([
    client
      .from("user_problem_srs")
      .select("created_at, last_reviewed_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .limit(20000),
    client
      .from("user_blank_srs")
      .select("created_at, last_reviewed_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .limit(20000),
    client
      .from("user_ox_ref_srs")
      .select("created_at, last_reviewed_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .limit(20000),
  ]);

  // 재처리는 created_at 보다 last_reviewed_at 이 더 늦은 항목 — 그 last 시점에 카운트.
  // 단, 같은 row 가 여러 번 재처리되어도 last_reviewed_at 은 마지막만 — 추이는 근사치.
  // 따라서 user_problem_attempts/user_blank_attempts/user_problem_attempts(ox)
  // 의 attempted_at 으로 정확한 "재처리" 일별 집계.
  const allReviewIso = new Date(sinceMs).toISOString();
  const [attemptsRes, blankAttemptsRes] = await Promise.all([
    client
      .from("user_problem_attempts")
      .select("problem_id, attempted_at, ox_answer, selected_choice_id, selected_box_item_id")
      .eq("user_id", userId)
      .gte("attempted_at", allReviewIso)
      .limit(20000),
    client
      .from("user_blank_attempts")
      .select("set_id, blank_idx, attempted_at")
      .eq("user_id", userId)
      .gte("attempted_at", allReviewIso)
      .limit(20000),
  ]);

  // 신규 (created_at on day) — 각 SRS 테이블 row 들의 created_at 일별.
  const addedByDay = new Map<string, number>();
  for (const r of [
    ...(problemRes.data ?? []),
    ...(blankRes.data ?? []),
    ...(oxRes.data ?? []),
  ]) {
    const key = kstDateKey(r.created_at);
    addedByDay.set(key, (addedByDay.get(key) ?? 0) + 1);
  }

  // 재처리 (attempted_at on day) — created 와 attempted 가 같은 항목은 created 카운트에
  // 이미 포함, 정확한 재처리 분리는 어려움 → 단순화: 일별 attempt 총수 - 일별 신규.
  // 음수가 되면 0으로 클램프.
  const attemptedByDay = new Map<string, number>();
  for (const r of attemptsRes.data ?? []) {
    const key = kstDateKey(r.attempted_at);
    attemptedByDay.set(key, (attemptedByDay.get(key) ?? 0) + 1);
  }
  for (const r of blankAttemptsRes.data ?? []) {
    const key = kstDateKey(r.attempted_at);
    attemptedByDay.set(key, (attemptedByDay.get(key) ?? 0) + 1);
  }

  // 일별 row 채우기 (오래된 → 최근).
  const days: SrsTrendDay[] = [];
  let totalAdded = 0;
  let totalReviewed = 0;
  let recent7Added = 0;
  let recent7Reviewed = 0;
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS + 9 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const added = addedByDay.get(key) ?? 0;
    const total = attemptedByDay.get(key) ?? 0;
    const reviewed = Math.max(0, total - added);
    days.push({ date: key, added, reviewed });
    totalAdded += added;
    totalReviewed += reviewed;
    if (i < 7) {
      recent7Added += added;
      recent7Reviewed += reviewed;
    }
  }
  return {
    daysBack,
    days,
    totalAdded,
    totalReviewed,
    avg7dAdded: recent7Added / 7,
    avg7dReviewed: recent7Reviewed / 7,
  };
}

function kstDateKey(iso: string): string {
  const ms = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

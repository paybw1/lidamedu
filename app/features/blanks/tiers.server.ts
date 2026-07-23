// feat-2-030 — 빈칸 난이도 단계 통과 기록 조회/저장(서버).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { BLANK_TIERS, type BlankTier } from "~/features/blanks/lib/tiers";

// 세트별 완료 tier 목록.
export async function getTierCompletionsBySet(
  client: SupabaseClient<Database>,
  userId: string,
  setIds: string[],
): Promise<Record<string, BlankTier[]>> {
  const out: Record<string, BlankTier[]> = {};
  if (setIds.length === 0) return out;
  const { data } = await client
    .from("blank_tier_completions")
    .select("set_id, tier")
    .eq("user_id", userId)
    .in("set_id", setIds);
  for (const r of data ?? []) {
    const t = r.tier as BlankTier;
    if (!BLANK_TIERS.includes(t)) continue;
    (out[r.set_id] ??= []).push(t);
  }
  return out;
}

// 통과 tier(들) 멱등 기록. RLS self-insert(정답 재검증은 호출부 API 책임).
export async function recordTierCompletions(
  client: SupabaseClient<Database>,
  userId: string,
  setId: string,
  tiers: BlankTier[],
): Promise<void> {
  if (tiers.length === 0) return;
  await client.from("blank_tier_completions").upsert(
    tiers.map((tier) => ({ user_id: userId, set_id: setId, tier })),
    { onConflict: "user_id,set_id,tier", ignoreDuplicates: true },
  );
}

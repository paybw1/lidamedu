// 운영자 전역 설정 (app_settings key-value 테이블) 접근 헬퍼 — feat-3-204.
// 테이블은 범용 key-value, 헬퍼는 설정별로 타입을 좁힌다. 쓰기는 RLS 로 staff 만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

// 최근 판례(/latest/cases) 노출 기간 — 롤링 개월 수. 0 = 기간 제한 없음.
export const LATEST_CASES_RECENCY_MONTHS_KEY = "latest_cases_recency_months";

/** app_settings 한 키의 값. 없으면 null. */
export async function getAppSetting(
  client: SupabaseClient<Database>,
  key: string,
): Promise<Json | null> {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/** app_settings 한 키를 upsert. RLS 로 staff 만 통과한다. */
export async function setAppSetting(
  client: SupabaseClient<Database>,
  key: string,
  value: Json,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from("app_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 최근 판례 노출 기간(개월). 미설정·비정상값은 0(기간 제한 없음). */
export async function getLatestCasesRecencyMonths(
  client: SupabaseClient<Database>,
): Promise<number> {
  const raw = await getAppSetting(client, LATEST_CASES_RECENCY_MONTHS_KEY);
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : 0;
}

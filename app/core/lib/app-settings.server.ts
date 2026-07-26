// 운영자 전역 설정 (app_settings key-value 테이블) 접근 헬퍼 — feat-3-204.
// 테이블은 범용 key-value, 헬퍼는 설정별로 타입을 좁힌다. 쓰기는 RLS 로 staff 만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

// 최근 판례(/latest/cases) 노출 기간 — 롤링 개월 수. 0 = 기간 제한 없음.
export const LATEST_CASES_RECENCY_MONTHS_KEY = "latest_cases_recency_months";

// 도서 무료배송 임계(원). 도서 결제금액 합계가 이 값 이상이면 배송비 면제. 0 = 미적용.
export const FREE_SHIPPING_THRESHOLD_KEY = "free_shipping_threshold_krw";

// 수강 후기 작성 보상 포인트(대상당 1회). 미설정 시 기본값(REVIEW_REWARD_POINTS_DEFAULT).
export const REVIEW_REWARD_POINTS_KEY = "review_reward_points";

// 강의 랜딩 히어로 단(tier) 사이 간격(px)과 그 간격 배경색. feat-12 배너.
export const LANDING_TIER_GAP_PX_KEY = "landing_tier_gap_px";
export const LANDING_TIER_GAP_COLOR_KEY = "landing_tier_gap_color";

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

/** 도서 무료배송 임계(원). 미설정·비정상값은 0(미적용). */
export async function getFreeShippingThresholdKrw(
  client: SupabaseClient<Database>,
): Promise<number> {
  const raw = await getAppSetting(client, FREE_SHIPPING_THRESHOLD_KEY);
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : 0;
}

// 후기 보상 기본 포인트 — app_settings 미설정 시 사용(운영관리에서 조정 가능).
export const REVIEW_REWARD_POINTS_DEFAULT = 2000;

/** 수강 후기 작성 보상 포인트. 미설정·비정상값은 기본값(2000). */
export async function getReviewRewardPoints(
  client: SupabaseClient<Database>,
): Promise<number> {
  const raw = await getAppSetting(client, REVIEW_REWARD_POINTS_KEY);
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : REVIEW_REWARD_POINTS_DEFAULT;
}

export interface LandingTierGap {
  /** 단 사이 간격(px). 0 = 붙임. */
  px: number;
  /** 간격 배경색(CSS 색). null = 투명(페이지 배경). */
  color: string | null;
}

/** 랜딩 히어로 단 사이 간격·색. 미설정 시 간격 0·투명. */
export async function getLandingTierGap(
  client: SupabaseClient<Database>,
): Promise<LandingTierGap> {
  const [pxRaw, colorRaw] = await Promise.all([
    getAppSetting(client, LANDING_TIER_GAP_PX_KEY),
    getAppSetting(client, LANDING_TIER_GAP_COLOR_KEY),
  ]);
  const px =
    typeof pxRaw === "number" && Number.isFinite(pxRaw) && pxRaw >= 0
      ? Math.min(400, Math.floor(pxRaw))
      : 0;
  const color =
    typeof colorRaw === "string" && /^#[0-9a-fA-F]{6}$/.test(colorRaw)
      ? colorRaw
      : null;
  return { px, color };
}

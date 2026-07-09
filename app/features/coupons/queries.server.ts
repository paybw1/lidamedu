// feat-13 쿠폰 관리 — 서버 쿼리(운영자 전용, RLS staff 정책).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { CouponRow } from "./labels";

type Client = SupabaseClient<Database>;

export async function listCoupons(client: Client): Promise<CouponRow[]> {
  const { data } = await client
    .from("coupons")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getCoupon(
  client: Client,
  id: string,
): Promise<CouponRow | null> {
  const { data } = await client
    .from("coupons")
    .select("*")
    .eq("coupon_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

export async function softDeleteCoupon(
  client: Client,
  id: string,
): Promise<void> {
  await client
    .from("coupons")
    .update({ deleted_at: new Date().toISOString() })
    .eq("coupon_id", id);
}

// 쿠폰ID(코드) 중복 회피 확인 — 있으면 true.
export async function codeExists(
  client: Client,
  code: string,
): Promise<boolean> {
  const { data } = await client
    .from("coupons")
    .select("coupon_id")
    .eq("code", code)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

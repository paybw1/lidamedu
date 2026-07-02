// 할인 서버 쿼리·해석 (feat-8-028 Stage D). 결제 금액 계산은 서버 권위.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  type Discount,
  type DiscountKind,
  type DiscountTargetKind,
  type ProductKind,
  bestAutomaticDiscount,
  discountAppliesToPlan,
  effectivePriceKrw,
} from "./labels";

export type { Discount } from "./labels";

const DISCOUNT_COLUMNS =
  "discount_id, name, code, kind, value, target_kind, target_plan_codes, starts_at, ends_at, renewal_until, min_amount_krw, max_uses, used_count, per_user_limit, is_active";

type DiscountRow = {
  discount_id: string;
  name: string;
  code: string | null;
  kind: string;
  value: number;
  target_kind: string;
  target_plan_codes: unknown;
  starts_at: string | null;
  ends_at: string | null;
  renewal_until: string | null;
  min_amount_krw: number | null;
  max_uses: number | null;
  used_count: number;
  per_user_limit: number | null;
  is_active: boolean;
};

function rowToDiscount(r: DiscountRow): Discount {
  return {
    discountId: r.discount_id,
    name: r.name,
    code: r.code,
    kind: r.kind as DiscountKind,
    value: r.value,
    targetKind: r.target_kind as DiscountTargetKind,
    targetPlanCodes: Array.isArray(r.target_plan_codes)
      ? (r.target_plan_codes as string[])
      : [],
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    renewalUntil: r.renewal_until,
    minAmountKrw: r.min_amount_krw,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    perUserLimit: r.per_user_limit,
    isActive: r.is_active,
  };
}

// 활성 할인 — 요금표 표시용(RLS 공개 읽기). 코드 할인 포함.
export async function listActiveDiscounts(
  client: SupabaseClient<Database>,
): Promise<Discount[]> {
  const { data, error } = await client
    .from("discounts")
    .select(DISCOUNT_COLUMNS)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((r) => rowToDiscount(r as DiscountRow));
}

// 전체 할인(비활성 포함) — 운영관리. adminClient.
export async function listAllDiscounts(): Promise<Discount[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("discounts")
    .select(DISCOUNT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDiscount(r as DiscountRow));
}

export interface UpsertDiscountInput {
  discountId?: string; // update 시
  name: string;
  code: string | null;
  kind: DiscountKind;
  value: number;
  targetKind: DiscountTargetKind;
  targetPlanCodes: string[];
  startsAt: string | null;
  endsAt: string | null;
  renewalUntil: string | null;
  minAmountKrw: number | null;
  maxUses: number | null;
  perUserLimit: number | null;
  isActive: boolean;
}

export async function upsertDiscount(
  input: UpsertDiscountInput,
  mode: "create" | "update",
): Promise<{ ok: true; discountId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const row = {
    name: input.name,
    code: input.code,
    kind: input.kind,
    value: input.value,
    target_kind: input.targetKind,
    target_plan_codes: input.targetPlanCodes as never,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    renewal_until: input.renewalUntil,
    min_amount_krw: input.minAmountKrw,
    max_uses: input.maxUses,
    per_user_limit: input.perUserLimit,
    is_active: input.isActive,
  };
  if (mode === "create") {
    const { data, error } = await admin
      .from("discounts")
      .insert(row)
      .select("discount_id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, discountId: data.discount_id };
  }
  if (!input.discountId) return { ok: false, error: "discountId 누락" };
  const { data, error } = await admin
    .from("discounts")
    .update(row)
    .eq("discount_id", input.discountId)
    .select("discount_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, discountId: data.discount_id };
}

// 결제 시 유효 할인 해석 — 코드(쿠폰) 또는 자동 프로모션. 유효 결제 금액 반환.
export async function resolveCheckoutDiscount(input: {
  plan: { code: string; productKind: ProductKind; priceKrw: number };
  code?: string | null;
  userId: string;
}): Promise<
  | { ok: true; discount: Discount | null; amountKrw: number }
  | { ok: false; error: string }
> {
  const admin = adminClient as SupabaseClient<Database>;
  const base = input.plan.priceKrw;
  const nowMs = Date.now();
  const { data } = await admin
    .from("discounts")
    .select(DISCOUNT_COLUMNS)
    .eq("is_active", true);
  const discounts = (data ?? []).map((r) => rowToDiscount(r as DiscountRow));

  const codeInput = input.code?.trim();
  if (codeInput) {
    const byCode = discounts.find(
      (d) => d.code && d.code.toLowerCase() === codeInput.toLowerCase(),
    );
    if (!byCode || !discountAppliesToPlan(byCode, input.plan, base, nowMs)) {
      return { ok: false, error: "사용할 수 없는 쿠폰입니다" };
    }
    if (byCode.perUserLimit != null) {
      const { count } = await admin
        .from("payments")
        .select("payment_id", { count: "exact", head: true })
        .eq("user_id", input.userId)
        .eq("discount_id", byCode.discountId)
        .eq("status", "completed");
      if ((count ?? 0) >= byCode.perUserLimit) {
        return { ok: false, error: "쿠폰 사용 한도를 초과했습니다" };
      }
    }
    return {
      ok: true,
      discount: byCode,
      amountKrw: effectivePriceKrw(base, byCode),
    };
  }

  // 코드 없으면 자동 프로모션 중 최대 할인.
  const auto = bestAutomaticDiscount(input.plan, base, discounts, nowMs);
  return {
    ok: true,
    discount: auto,
    amountKrw: auto ? effectivePriceKrw(base, auto) : base,
  };
}

// 할인 삭제. payments FK 는 ON DELETE SET NULL(결제 이력 보존).
export async function deleteDiscount(
  discountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("discounts")
    .delete()
    .eq("discount_id", discountId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 결제 완료 시 할인 사용 횟수 +1 (best-effort, 경미한 경쟁 허용).
export async function incrementDiscountUse(discountId: string): Promise<void> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data } = await admin
    .from("discounts")
    .select("used_count")
    .eq("discount_id", discountId)
    .maybeSingle();
  if (!data) return;
  await admin
    .from("discounts")
    .update({ used_count: (data.used_count ?? 0) + 1 })
    .eq("discount_id", discountId);
}

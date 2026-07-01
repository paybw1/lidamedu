// 구독·결제 서버 쿼리. 본인 read 는 RLS. 결제 write 는 service_role(server action) 만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import type {
  PaymentRow,
  PaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from "./labels";

export type {
  PaymentRow,
  PaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from "./labels";

function rowToPlan(r: {
  plan_id: string;
  code: string;
  name: string;
  description: string | null;
  price_krw: number;
  duration_days: number;
  features: unknown;
  display_order: number;
  is_active: boolean;
}): SubscriptionPlan {
  return {
    planId: r.plan_id,
    code: r.code,
    name: r.name,
    description: r.description,
    priceKrw: r.price_krw,
    durationDays: r.duration_days,
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}

export async function listSubscriptionPlans(
  client: SupabaseClient<Database>,
): Promise<SubscriptionPlan[]> {
  const { data, error } = await client
    .from("subscription_plans")
    .select(
      "plan_id, code, name, description, price_krw, duration_days, features, display_order, is_active",
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPlan);
}

export async function getPlanByCode(
  client: SupabaseClient<Database>,
  code: string,
): Promise<SubscriptionPlan | null> {
  const { data, error } = await client
    .from("subscription_plans")
    .select(
      "plan_id, code, name, description, price_krw, duration_days, features, display_order, is_active",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPlan(data) : null;
}

export interface ActiveSubscriptionInfo {
  hasActive: boolean;
  subscription: UserSubscription | null;
  /** 유효 플랜 코드 — 'free' | 'pro_monthly' | 'cohort'. cohort 멤버십(구독 row 없음)도 반영. feat-8-008. */
  planCode: string;
  features: string[]; // 활성 구독/cohort/무료 플랜 기능
}

// 사용자의 활성 구독 + 기능 set. 무료 사용자는 free 플랜 features.
export async function getActiveSubscription(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ActiveSubscriptionInfo> {
  // 활성 구독 — expires_at > now() AND status='active'
  const { data: sub } = await client
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, subscription_plans!inner(code, name, features)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    return {
      hasActive: true,
      subscription: {
        subscriptionId: sub.subscription_id,
        userId: sub.user_id,
        planId: sub.plan_id,
        planCode: sub.subscription_plans.code,
        planName: sub.subscription_plans.name,
        startedAt: sub.started_at,
        expiresAt: sub.expires_at,
        status: sub.status as SubscriptionStatus,
        paymentId: sub.payment_id,
      },
      planCode: sub.subscription_plans.code,
      features: Array.isArray(sub.subscription_plans.features)
        ? (sub.subscription_plans.features as string[])
        : [],
    };
  }

  // feat-8-008: 활성 cohort 멤버 = 종합반(회원3) — 구독 row 없이 cohort 플랜 기능 부여.
  const { data: cohortMember } = await client
    .from("cohort_members")
    .select("cohort_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();
  if (cohortMember) {
    const { data: cohortPlan } = await client
      .from("subscription_plans")
      .select("features")
      .eq("code", "cohort")
      .maybeSingle();
    return {
      hasActive: true,
      subscription: null,
      planCode: "cohort",
      features: Array.isArray(cohortPlan?.features)
        ? (cohortPlan.features as string[])
        : [],
    };
  }

  // free plan features
  const { data: freePlan } = await client
    .from("subscription_plans")
    .select("features")
    .eq("code", "free")
    .maybeSingle();
  const freeFeatures = Array.isArray(freePlan?.features)
    ? (freePlan.features as string[])
    : [];
  return {
    hasActive: false,
    subscription: null,
    planCode: "free",
    features: freeFeatures,
  };
}

export async function hasFeature(
  client: SupabaseClient<Database>,
  userId: string,
  feature: string,
): Promise<boolean> {
  // feat-8-027: 등급 리졸버(체험/무료회원/자기학습/종합반 종류) 기준.
  const access = await getMembershipAccess(client, userId);
  return access.grade === "staff" || access.features.includes(feature);
}

// feat-8-008/8-027: 영역 게이트 — 라우트 그룹 loader 에서 호출. 해당 영역 기능이 없으면
// /pricing?locked= 으로 redirect. staff(강사/관리자/원장)는 구독 게이팅 면제.
export async function requireFeature(
  client: SupabaseClient<Database>,
  userId: string,
  feature: string,
): Promise<void> {
  const access = await getMembershipAccess(client, userId);
  if (access.grade === "staff") return;
  if (!access.features.includes(feature)) {
    throw redirect(`/pricing?locked=${encodeURIComponent(feature)}`);
  }
}

// ─── 결제 ───

export async function createPendingPayment(input: {
  userId: string;
  plan: SubscriptionPlan;
  tossOrderId: string;
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("payments")
    .insert({
      user_id: input.userId,
      plan_id: input.plan.planId,
      amount_krw: input.plan.priceKrw,
      status: "pending",
      toss_order_id: input.tossOrderId,
    })
    .select("payment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, paymentId: data.payment_id };
}

export interface ConfirmPaymentInput {
  tossOrderId: string;
  tossPaymentKey: string;
  amountKrw: number;
}

// 토스 confirm API 호출 후 payment + subscription row 갱신.
export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<
  | { ok: true; subscription: UserSubscription }
  | { ok: false; error: string }
> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) pending payment 조회 + 금액·order_id 일치 검증
  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .select(
      "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, subscription_plans(duration_days, code, name)",
    )
    .eq("toss_order_id", input.tossOrderId)
    .maybeSingle();
  if (payErr) return { ok: false, error: payErr.message };
  if (!payRow) return { ok: false, error: "결제 정보를 찾을 수 없습니다" };
  if (payRow.status === "completed")
    return { ok: false, error: "이미 완료된 결제입니다" };
  if (payRow.amount_krw !== input.amountKrw)
    return { ok: false, error: "결제 금액 불일치" };

  // 2) Toss confirm API
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret)
    return { ok: false, error: "TOSS_SECRET_KEY 환경변수 미설정" };
  const basic = Buffer.from(`${secret}:`).toString("base64");
  let tossPayload: Record<string, unknown> | null = null;
  try {
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: input.tossPaymentKey,
        orderId: input.tossOrderId,
        amount: input.amountKrw,
      }),
    });
    tossPayload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof tossPayload?.message === "string"
          ? tossPayload.message
          : `Toss 결제 확인 실패 (HTTP ${res.status})`;
      await admin
        .from("payments")
        .update({
          status: "failed",
          failure_reason: msg,
          toss_response: tossPayload as never,
        })
        .eq("payment_id", payRow.payment_id);
      return { ok: false, error: msg };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Toss API 호출 실패: ${msg}` };
  }

  // 3) payment 완료 마킹
  await admin
    .from("payments")
    .update({
      status: "completed",
      toss_payment_key: input.tossPaymentKey,
      toss_response: tossPayload as never,
    })
    .eq("payment_id", payRow.payment_id);

  // 4) 구독 row insert (기존 활성 구독 있으면 연장)
  const durationDays = payRow.subscription_plans?.duration_days ?? 30;
  const now = new Date();
  const { data: existing } = await admin
    .from("user_subscriptions")
    .select("subscription_id, expires_at")
    .eq("user_id", payRow.user_id)
    .eq("plan_id", payRow.plan_id)
    .eq("status", "active")
    .gte("expires_at", now.toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let baseTimeMs: number;
  if (existing && new Date(existing.expires_at).getTime() > now.getTime()) {
    baseTimeMs = new Date(existing.expires_at).getTime();
  } else {
    baseTimeMs = now.getTime();
  }
  const newExpiresAt = new Date(
    baseTimeMs + durationDays * 86_400_000,
  ).toISOString();

  if (existing) {
    await admin
      .from("user_subscriptions")
      .update({
        expires_at: newExpiresAt,
        payment_id: payRow.payment_id,
      })
      .eq("subscription_id", existing.subscription_id);
  } else {
    await admin.from("user_subscriptions").insert({
      user_id: payRow.user_id,
      plan_id: payRow.plan_id,
      payment_id: payRow.payment_id,
      started_at: now.toISOString(),
      expires_at: newExpiresAt,
      status: "active",
    });
  }

  // 5) 최신 구독 fetch 후 반환
  const { data: latestSub, error: latestErr } = await admin
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, subscription_plans!inner(code, name)",
    )
    .eq("user_id", payRow.user_id)
    .eq("plan_id", payRow.plan_id)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr || !latestSub) {
    return {
      ok: false,
      error: latestErr?.message ?? "구독 생성 후 조회 실패",
    };
  }

  return {
    ok: true,
    subscription: {
      subscriptionId: latestSub.subscription_id,
      userId: latestSub.user_id,
      planId: latestSub.plan_id,
      planCode: latestSub.subscription_plans.code,
      planName: latestSub.subscription_plans.name,
      startedAt: latestSub.started_at,
      expiresAt: latestSub.expires_at,
      status: latestSub.status as SubscriptionStatus,
      paymentId: latestSub.payment_id,
    },
  };
}

export async function listMyPayments(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PaymentRow[]> {
  const { data, error } = await client
    .from("payments")
    .select(
      "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, toss_payment_key, failure_reason, created_at, subscription_plans!inner(code, name)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    paymentId: r.payment_id,
    userId: r.user_id,
    planId: r.plan_id,
    planCode: r.subscription_plans.code,
    planName: r.subscription_plans.name,
    amountKrw: r.amount_krw,
    status: r.status as PaymentStatus,
    tossOrderId: r.toss_order_id,
    tossPaymentKey: r.toss_payment_key,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
  }));
}

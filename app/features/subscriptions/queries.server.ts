// 구독·결제 서버 쿼리. 본인 read 는 RLS. 결제 write 는 service_role(server action) 만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { incrementDiscountUse } from "~/features/subscriptions/discounts.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import type {
  PaymentRow,
  PaymentStatus,
  ProductKind,
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from "./labels";

export type {
  PaymentRow,
  PaymentStatus,
  ProductKind,
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from "./labels";

const PLAN_COLUMNS =
  "plan_id, code, name, description, price_krw, duration_days, features, subject_codes, product_kind, available_from, display_order, is_active";

function rowToPlan(r: {
  plan_id: string;
  code: string;
  name: string;
  description: string | null;
  price_krw: number;
  duration_days: number;
  features: unknown;
  subject_codes: unknown;
  product_kind: string;
  available_from: string | null;
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
    subjectCodes: Array.isArray(r.subject_codes)
      ? (r.subject_codes as string[])
      : [],
    productKind: r.product_kind as SubscriptionPlan["productKind"],
    availableFrom: r.available_from,
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}

export async function listSubscriptionPlans(
  client: SupabaseClient<Database>,
): Promise<SubscriptionPlan[]> {
  const { data, error } = await client
    .from("subscription_plans")
    .select(PLAN_COLUMNS)
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
    .select(PLAN_COLUMNS)
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPlan(data) : null;
}

// ─── 상품(플랜) 관리 (feat-8-028 Stage B, admin) ───

// 전체 플랜(비활성 포함) — 운영관리 상품 목록. adminClient.
export async function listAllPlans(): Promise<SubscriptionPlan[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("subscription_plans")
    .select(PLAN_COLUMNS)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPlan);
}

export interface UpsertPlanInput {
  code: string;
  name: string;
  description: string | null;
  priceKrw: number;
  durationDays: number;
  productKind: ProductKind;
  subjectCodes: string[];
  features: string[];
  availableFrom: string | null;
  displayOrder: number;
  isActive: boolean;
}

// 상품 생성/수정. code 는 생성 시에만 지정(수정 시 불변 키). adminClient.
export async function upsertPlan(
  input: UpsertPlanInput,
  mode: "create" | "update",
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const row = {
    name: input.name,
    description: input.description,
    price_krw: input.priceKrw,
    duration_days: input.durationDays,
    product_kind: input.productKind,
    subject_codes: input.subjectCodes as never,
    features: input.features as never,
    available_from: input.availableFrom,
    display_order: input.displayOrder,
    is_active: input.isActive,
  };
  if (mode === "create") {
    const { data, error } = await admin
      .from("subscription_plans")
      .insert({ code: input.code, ...row })
      .select("plan_id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, planId: data.plan_id };
  }
  const { data, error } = await admin
    .from("subscription_plans")
    .update(row)
    .eq("code", input.code)
    .select("plan_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, planId: data.plan_id };
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
  /** 자기학습 과목별 결제 — 결제하는 학습과목 슬러그. 전체 플랜은 null. */
  subjectCode?: string | null;
  /** feat-8-028 — 할인 적용 후 실제 결제 금액(미지정 시 정가). */
  amountKrw?: number;
  /** 적용된 할인 id(있으면). */
  discountId?: string | null;
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("payments")
    .insert({
      user_id: input.userId,
      plan_id: input.plan.planId,
      amount_krw: input.amountKrw ?? input.plan.priceKrw,
      status: "pending",
      toss_order_id: input.tossOrderId,
      subject_code: input.subjectCode ?? null,
      discount_id: input.discountId ?? null,
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
      "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, subject_code, discount_id, subscription_plans(duration_days, code, name)",
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

  // feat-8-028 — 할인 사용 횟수 반영(완료 시점).
  if (payRow.discount_id) {
    await incrementDiscountUse(payRow.discount_id);
  }

  // 4) 구독 row insert (같은 플랜·과목의 기존 활성 구독 있으면 연장). 과목별 결제라
  //    subject_code 단위로 매칭 — null(전체 플랜)과 특정 과목을 구분한다.
  const durationDays = payRow.subscription_plans?.duration_days ?? 30;
  const subjectCode = payRow.subject_code ?? null;
  const now = new Date();
  let existingQuery = admin
    .from("user_subscriptions")
    .select("subscription_id, expires_at")
    .eq("user_id", payRow.user_id)
    .eq("plan_id", payRow.plan_id)
    .eq("status", "active")
    .gte("expires_at", now.toISOString());
  existingQuery = subjectCode
    ? existingQuery.eq("subject_code", subjectCode)
    : existingQuery.is("subject_code", null);
  const { data: existing } = await existingQuery
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 유료 기간 시작점 계산:
  //  · 기존 활성 구독 연장 → 그 만료일부터.
  //  · 신규 + 가입 15일 체험 중 → ★체험 종료일부터(#3, 일찍 결제해도 체험 손해 없음).
  //  · 그 외 신규 → 지금부터.
  let baseTimeMs: number;
  if (existing && new Date(existing.expires_at).getTime() > now.getTime()) {
    baseTimeMs = new Date(existing.expires_at).getTime();
  } else {
    const { data: prof } = await admin
      .from("profiles")
      .select("trial_ends_at")
      .eq("profile_id", payRow.user_id)
      .maybeSingle();
    const trialEndMs = prof?.trial_ends_at
      ? new Date(prof.trial_ends_at).getTime()
      : 0;
    baseTimeMs = trialEndMs > now.getTime() ? trialEndMs : now.getTime();
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
      subject_code: subjectCode,
      // 체험 중 결제면 유료 기간 시작 = 체험 종료일(그 전까지는 체험으로 이용).
      started_at: new Date(baseTimeMs).toISOString(),
      expires_at: newExpiresAt,
      status: "active",
    });
  }

  // 5) 최신 구독 fetch 후 반환 (방금 결제한 과목 단위로).
  let latestQuery = admin
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, subscription_plans!inner(code, name)",
    )
    .eq("user_id", payRow.user_id)
    .eq("plan_id", payRow.plan_id);
  latestQuery = subjectCode
    ? latestQuery.eq("subject_code", subjectCode)
    : latestQuery.is("subject_code", null);
  const { data: latestSub, error: latestErr } = await latestQuery
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

// feat-8-028 — 해지·환불 정책:
//  · 결제 후 3일 이내 해지 → 전액 환불 + 정기구독 즉시 취소(접근 종료).
//  · 3일 경과 후 해지 → 그 달분 환불 없음. 정기구독만 해지(다음 갱신 청구 없음),
//    남은 기간(만료일)까지 이용.
export const REFUND_WINDOW_DAYS = 3;

/** 결제 후 3일 이내인가 — 전액 환불 가능 판정(순수, UI/서버 공용). */
export function isRefundable(status: string, createdAtIso: string): boolean {
  if (status !== "completed") return false;
  const created = new Date(createdAtIso).getTime();
  return Date.now() <= created + REFUND_WINDOW_DAYS * 86_400_000;
}

// 본인 구독 해지 — 소유권·상태 검증 후 3일 정책 분기. ★서버 권위(클라 신뢰 안 함).
//  refunded=true  → 3일 이내: Toss 전액 취소 + 구독 즉시 종료.
//  refunded=false → 3일 경과: 환불 없음, auto_renew off + cancelled_at(잔여기간 이용).
export async function cancelSubscription(input: {
  userId: string;
  subscriptionId: string;
}): Promise<
  | { ok: true; refunded: boolean; accessUntil: string | null }
  | { ok: false; error: string }
> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: sub, error: subErr } = await admin
    .from("user_subscriptions")
    .select("subscription_id, user_id, status, expires_at, payment_id")
    .eq("subscription_id", input.subscriptionId)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub) return { ok: false, error: "구독 정보를 찾을 수 없습니다" };
  if (sub.user_id !== input.userId)
    return { ok: false, error: "본인 구독만 해지할 수 있습니다" };
  if (sub.status !== "active")
    return { ok: false, error: "활성 구독만 해지할 수 있습니다" };

  const nowIso = new Date().toISOString();

  // 연결된 최종 결제(3일 이내면 전액 환불 대상).
  let pay: {
    payment_id: string;
    amount_krw: number;
    status: string;
    toss_payment_key: string | null;
    created_at: string;
  } | null = null;
  if (sub.payment_id) {
    const { data } = await admin
      .from("payments")
      .select("payment_id, amount_krw, status, toss_payment_key, created_at")
      .eq("payment_id", sub.payment_id)
      .maybeSingle();
    pay = data ?? null;
  }

  // 3일 이내 — 전액 환불 + 즉시 종료.
  if (pay && isRefundable(pay.status, pay.created_at)) {
    if (!pay.toss_payment_key)
      return { ok: false, error: "결제 키가 없어 환불할 수 없습니다" };
    const secret = process.env.TOSS_SECRET_KEY;
    if (!secret) return { ok: false, error: "TOSS_SECRET_KEY 환경변수 미설정" };
    const basic = Buffer.from(`${secret}:`).toString("base64");
    const reason = "고객 해지 요청(결제 후 3일 이내 전액 환불)";
    try {
      const res = await fetch(
        `https://api.tosspayments.com/v1/payments/${pay.toss_payment_key}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cancelReason: reason }),
        },
      );
      const payload = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          typeof payload?.message === "string"
            ? payload.message
            : `Toss 환불 실패 (HTTP ${res.status})`;
        return { ok: false, error: msg };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `Toss 환불 API 호출 실패: ${msg}` };
    }
    await admin
      .from("payments")
      .update({
        status: "refunded",
        refunded_at: nowIso,
        refund_amount_krw: pay.amount_krw,
        refund_reason: reason,
      })
      .eq("payment_id", pay.payment_id);
    await admin
      .from("user_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        auto_renew: false,
        updated_at: nowIso,
      })
      .eq("subscription_id", sub.subscription_id);
    return { ok: true, refunded: true, accessUntil: null };
  }

  // 3일 경과 — 환불 없음. 정기결제만 해지(다음 갱신 청구 없음), 남은 기간 이용.
  await admin
    .from("user_subscriptions")
    .update({ auto_renew: false, cancelled_at: nowIso, updated_at: nowIso })
    .eq("subscription_id", sub.subscription_id);
  return { ok: true, refunded: false, accessUntil: sub.expires_at };
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

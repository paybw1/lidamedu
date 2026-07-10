// 구독·결제 서버 쿼리. 본인 read 는 RLS. 결제 write 는 service_role(server action) 만.

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  markOrderPaidAndFulfill,
  markOrderRefundedAndRevoke,
} from "~/features/orders/orders.server";
import {
  incrementDiscountUse,
  listActiveDiscounts,
} from "~/features/subscriptions/discounts.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import { discountAppliesAtRenewal, effectivePriceKrw } from "./labels";

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
  "plan_id, code, name, description, price_krw, duration_days, features, subject_codes, product_kind, available_from, display_order, is_active, sale_status";

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
  sale_status: string;
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
    saleStatus: (r.sale_status as SubscriptionPlan["saleStatus"]) ?? "hidden",
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
  saleStatus: SubscriptionPlan["saleStatus"];
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
    sale_status: input.saleStatus,
    // is_active 는 sale_status 의 파생(단일 소유자) — 기존 소비처(pricing·catalog·resolver) 무변경.
    is_active: input.saleStatus === "on_sale",
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

// ─── 강의 수강 정책 (plan_policies, course/tpass 전용) ───
// DRM 감사 ★★★★★ 공백(배수·수강기간·일시정지·기기·다운로드·연장) 편집 대상.
// enforcement 소비처: orders.server(수강기간·배수 스냅샷), playback.server(기기 슬롯).

export interface PlanPolicy {
  planId: string;
  multiplier: number | null;
  durationDays: number | null;
  fixedEndDate: string | null;
  allowDownload: boolean;
  allowPc: boolean;
  allowMobile: boolean;
  maxDevicesPc: number;
  maxDevicesMobile: number;
  pauseAllowed: boolean;
  pauseMaxCount: number;
  pauseMinDays: number;
  pauseMaxDays: number;
  pauseTotalDays: number;
  extensionAllowed: boolean;
  extensionPlanIds: string[];
}

const POLICY_COLUMNS =
  "plan_id, multiplier, duration_days, fixed_end_date, allow_download, allow_pc, allow_mobile, max_devices_pc, max_devices_mobile, pause_allowed, pause_max_count, pause_min_days, pause_max_days, pause_total_days, extension_allowed, extension_plan_ids";

function rowToPolicy(r: {
  plan_id: string;
  multiplier: number | null;
  duration_days: number | null;
  fixed_end_date: string | null;
  allow_download: boolean;
  allow_pc: boolean;
  allow_mobile: boolean;
  max_devices_pc: number;
  max_devices_mobile: number;
  pause_allowed: boolean;
  pause_max_count: number;
  pause_min_days: number;
  pause_max_days: number;
  pause_total_days: number;
  extension_allowed: boolean;
  extension_plan_ids: unknown;
}): PlanPolicy {
  return {
    planId: r.plan_id,
    multiplier: r.multiplier,
    durationDays: r.duration_days,
    fixedEndDate: r.fixed_end_date,
    allowDownload: r.allow_download,
    allowPc: r.allow_pc,
    allowMobile: r.allow_mobile,
    maxDevicesPc: r.max_devices_pc,
    maxDevicesMobile: r.max_devices_mobile,
    pauseAllowed: r.pause_allowed,
    pauseMaxCount: r.pause_max_count,
    pauseMinDays: r.pause_min_days,
    pauseMaxDays: r.pause_max_days,
    pauseTotalDays: r.pause_total_days,
    extensionAllowed: r.extension_allowed,
    extensionPlanIds: Array.isArray(r.extension_plan_ids)
      ? (r.extension_plan_ids as string[])
      : [],
  };
}

// planId → PlanPolicy 맵. 정책 행이 없는 플랜은 맵에서 제외(폼이 기본값 사용). adminClient.
export async function getPlanPolicies(
  planIds: string[],
): Promise<Record<string, PlanPolicy>> {
  if (planIds.length === 0) return {};
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("plan_policies")
    .select(POLICY_COLUMNS)
    .in("plan_id", planIds);
  if (error) throw error;
  const out: Record<string, PlanPolicy> = {};
  for (const r of data ?? []) out[r.plan_id] = rowToPolicy(r);
  return out;
}

// ─── 상품↔강의(에디션) 연결 (plan_courses) ───
// course = 보통 1개 에디션, tpass = 여러 에디션. 지급 시 orders.server 가 이 연결로 enrollment 생성.

// planId → 연결된 courseId[] 맵. adminClient.
export async function getPlanCourseLinks(
  planIds: string[],
): Promise<Record<string, string[]>> {
  if (planIds.length === 0) return {};
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("plan_courses")
    .select("plan_id, course_id")
    .in("plan_id", planIds);
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const r of data ?? []) (out[r.plan_id] ??= []).push(r.course_id);
  return out;
}

// 연결 동기화 — 목표 courseIds 로 교체(제거분 delete + 추가분 upsert). adminClient.
export async function syncPlanCourses(
  planId: string,
  courseIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const target = new Set(courseIds);
  const { data: existing, error: exErr } = await admin
    .from("plan_courses")
    .select("course_id")
    .eq("plan_id", planId);
  if (exErr) return { ok: false, error: exErr.message };
  const have = new Set((existing ?? []).map((r) => r.course_id));
  const toRemove = [...have].filter((c) => !target.has(c));
  const toAdd = [...target].filter((c) => !have.has(c));
  if (toRemove.length > 0) {
    const { error } = await admin
      .from("plan_courses")
      .delete()
      .eq("plan_id", planId)
      .in("course_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length > 0) {
    const { error } = await admin
      .from("plan_courses")
      .upsert(
        toAdd.map((cid) => ({ plan_id: planId, course_id: cid })),
        { onConflict: "plan_id,course_id" },
      );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ─── 상품↔교재(도서) 연결 (plan_books) ───
// 강의 상품에 사용 교재를 연결 → 카탈로그·수강화면 교재 크로스셀.

// planId → 연결된 bookId[] 맵. adminClient.
export async function getPlanBookLinks(
  planIds: string[],
): Promise<Record<string, string[]>> {
  if (planIds.length === 0) return {};
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("plan_books")
    .select("plan_id, book_id")
    .in("plan_id", planIds);
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const r of data ?? []) (out[r.plan_id] ??= []).push(r.book_id);
  return out;
}

// 연결 동기화 — 목표 bookIds 로 교체(제거분 delete + 추가분 upsert). adminClient.
export async function syncPlanBooks(
  planId: string,
  bookIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const target = new Set(bookIds);
  const { data: existing, error: exErr } = await admin
    .from("plan_books")
    .select("book_id")
    .eq("plan_id", planId);
  if (exErr) return { ok: false, error: exErr.message };
  const have = new Set((existing ?? []).map((r) => r.book_id));
  const toRemove = [...have].filter((b) => !target.has(b));
  const toAdd = [...target].filter((b) => !have.has(b));
  if (toRemove.length > 0) {
    const { error } = await admin
      .from("plan_books")
      .delete()
      .eq("plan_id", planId)
      .in("book_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  if (toAdd.length > 0) {
    const { error } = await admin
      .from("plan_books")
      .upsert(
        toAdd.map((bid) => ({ plan_id: planId, book_id: bid })),
        { onConflict: "plan_id,book_id" },
      );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type UpsertPlanPolicyInput = Omit<PlanPolicy, "planId">;

// 정책 생성/갱신(plan_id 유일). adminClient.
export async function upsertPlanPolicy(
  planId: string,
  input: UpsertPlanPolicyInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("plan_policies").upsert(
    {
      plan_id: planId,
      multiplier: input.multiplier,
      duration_days: input.durationDays,
      fixed_end_date: input.fixedEndDate,
      allow_download: input.allowDownload,
      allow_pc: input.allowPc,
      allow_mobile: input.allowMobile,
      max_devices_pc: input.maxDevicesPc,
      max_devices_mobile: input.maxDevicesMobile,
      pause_allowed: input.pauseAllowed,
      pause_max_count: input.pauseMaxCount,
      pause_min_days: input.pauseMinDays,
      pause_max_days: input.pauseMaxDays,
      pause_total_days: input.pauseTotalDays,
      extension_allowed: input.extensionAllowed,
      extension_plan_ids: input.extensionPlanIds as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
) {
  const access = await getMembershipAccess(client, userId);
  if (access.grade === "staff") return access;
  if (!access.features.includes(feature)) {
    throw redirect(`/pricing?locked=${encodeURIComponent(feature)}`);
  }
  return access;
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
  /** feat-11-004 4a — 연결 주문(1-item). 이 시점부터 단건 결제도 주문 경유. */
  orderId?: string | null;
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
      order_id: input.orderId ?? null,
    })
    .select("payment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, paymentId: data.payment_id };
}

/** feat-11 장바구니 — 주문 단위 pending 결제(단일 plan 없음 → plan_id null).
 *  지급은 confirmPayment 가 order_id 로 fulfill(구독 upsert 스킵). */
export async function createPendingCartPayment(input: {
  userId: string;
  tossOrderId: string;
  amountKrw: number;
  orderId: string;
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("payments")
    .insert({
      user_id: input.userId,
      plan_id: null,
      amount_krw: input.amountKrw,
      status: "pending",
      toss_order_id: input.tossOrderId,
      order_id: input.orderId,
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

// 결제 기간 반영(공용) — 일회성 결제·자동결제(빌링) 모두 사용.
//  · 같은 플랜·과목의 활성 구독 있으면 만료일 연장, 없으면 신규.
//  · 신규 + 가입 15일 체험 중이면 유료 기간을 체험 종료일부터 시작(#3).
//  · autoRenew 지정 시 정기결제 여부 반영(빌링=true).
export async function upsertPaidSubscription(
  admin: SupabaseClient<Database>,
  input: {
    userId: string;
    planId: string;
    subjectCode: string | null;
    durationDays: number;
    /** 무통장(4b) 지급은 payments 트랜잭션이 없어 null. */
    paymentId: string | null;
    autoRenew?: boolean;
  },
): Promise<{ subscription: UserSubscription } | { error: string }> {
  const now = new Date();
  let existingQuery = admin
    .from("user_subscriptions")
    .select("subscription_id, expires_at")
    .eq("user_id", input.userId)
    .eq("plan_id", input.planId)
    .eq("status", "active")
    .gte("expires_at", now.toISOString());
  existingQuery = input.subjectCode
    ? existingQuery.eq("subject_code", input.subjectCode)
    : existingQuery.is("subject_code", null);
  const { data: existing } = await existingQuery
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let baseTimeMs: number;
  if (existing && new Date(existing.expires_at).getTime() > now.getTime()) {
    baseTimeMs = new Date(existing.expires_at).getTime();
  } else {
    const { data: prof } = await admin
      .from("profiles")
      .select("trial_ends_at")
      .eq("profile_id", input.userId)
      .maybeSingle();
    const trialEndMs = prof?.trial_ends_at
      ? new Date(prof.trial_ends_at).getTime()
      : 0;
    baseTimeMs = trialEndMs > now.getTime() ? trialEndMs : now.getTime();
  }
  const newExpiresAt = new Date(
    baseTimeMs + input.durationDays * 86_400_000,
  ).toISOString();

  if (existing) {
    await admin
      .from("user_subscriptions")
      .update({
        expires_at: newExpiresAt,
        payment_id: input.paymentId,
        ...(input.autoRenew !== undefined
          ? { auto_renew: input.autoRenew }
          : {}),
      })
      .eq("subscription_id", existing.subscription_id);
  } else {
    await admin.from("user_subscriptions").insert({
      user_id: input.userId,
      plan_id: input.planId,
      payment_id: input.paymentId,
      subject_code: input.subjectCode,
      started_at: new Date(baseTimeMs).toISOString(),
      expires_at: newExpiresAt,
      status: "active",
      auto_renew: input.autoRenew ?? false,
    });
  }

  let latestQuery = admin
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, subscription_plans!inner(code, name)",
    )
    .eq("user_id", input.userId)
    .eq("plan_id", input.planId);
  latestQuery = input.subjectCode
    ? latestQuery.eq("subject_code", input.subjectCode)
    : latestQuery.is("subject_code", null);
  const { data: latestSub, error: latestErr } = await latestQuery
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr || !latestSub) {
    return { error: latestErr?.message ?? "구독 생성 후 조회 실패" };
  }
  return {
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

// 토스 confirm API 호출 후 payment + subscription row 갱신.
//   가상계좌(WAITING_FOR_DEPOSIT)는 승인만 된 상태 — 구독을 활성화하지 않고
//   pending 으로 두며, 입금 완료는 웹훅(/api/payments/toss/webhook)이 반영한다.
export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<
  | { ok: true; subscription: UserSubscription }
  | { ok: true; pendingDeposit: true }
  // feat-11-004 4a — course/tpass 상품: 구독 대신 주문 fulfill(enrollments)로 지급 완료.
  | { ok: true; fulfilledOrder: true }
  | { ok: false; error: string }
> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) pending payment 조회 + 금액·order_id 일치 검증
  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .select(
      "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, subject_code, discount_id, order_id, subscription_plans(duration_days, code, name)",
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

  // 2.5) 승인 응답의 실제 상태 검증 — HTTP 200 이어도 DONE 이어야 완료.
  const tossStatus =
    typeof tossPayload?.status === "string" ? tossPayload.status : null;
  if (tossStatus === "WAITING_FOR_DEPOSIT") {
    // 가상계좌 발급 완료·입금 전 — 키/응답만 저장하고 pending 유지(입금=웹훅).
    await admin
      .from("payments")
      .update({
        toss_payment_key: input.tossPaymentKey,
        toss_response: tossPayload as never,
      })
      .eq("payment_id", payRow.payment_id);
    if (payRow.order_id) {
      await admin
        .from("orders")
        .update({ status: "pending_deposit" })
        .eq("order_id", payRow.order_id)
        .eq("status", "pending_payment");
    }
    return { ok: true, pendingDeposit: true };
  }
  if (tossStatus !== "DONE") {
    const msg = `승인 상태 이상 (${tossStatus ?? "unknown"})`;
    await admin
      .from("payments")
      .update({
        status: "failed",
        failure_reason: msg,
        toss_payment_key: input.tossPaymentKey,
        toss_response: tossPayload as never,
      })
      .eq("payment_id", payRow.payment_id);
    return { ok: false, error: msg };
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

  // feat-11-004 4a — 연결 주문 paid 전이 + course/tpass 항목 지급(멱등).
  //   subject/bundle/membership 의 user_subscriptions 지급은 아래 기존 경로가 담당.
  if (payRow.order_id) {
    await markOrderPaidAndFulfill(payRow.order_id);
  }

  // feat-11 장바구니 — plan_id 가 null 이면 이 결제는 주문(order_items)으로만 지급되는
  //   카트 주문(강의 enrollment·도서 배송은 위 fulfill 이 처리). 구독 upsert 대상 아님.
  if (!payRow.plan_id) {
    return { ok: true, fulfilledOrder: true };
  }

  // 4~5) 결제 기간 반영(체험 오프셋·연장 포함) — 빌링과 공용 헬퍼.
  //   course/tpass 상품은 구독이 아니라 enrollments 지급으로 끝(구독 upsert 스킵).
  const { data: planKindRow } = await admin
    .from("subscription_plans")
    .select("product_kind")
    .eq("plan_id", payRow.plan_id)
    .maybeSingle();
  if (planKindRow?.product_kind === "course" || planKindRow?.product_kind === "tpass") {
    return { ok: true, fulfilledOrder: true };
  }
  const durationDays = payRow.subscription_plans?.duration_days ?? 30;
  const res = await upsertPaidSubscription(admin, {
    userId: payRow.user_id,
    planId: payRow.plan_id,
    subjectCode: payRow.subject_code ?? null,
    durationDays,
    paymentId: payRow.payment_id,
  });
  if ("error" in res) return { ok: false, error: res.error };
  return { ok: true, subscription: res.subscription };
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
    // feat-11-004 4a — 연결 주문 환불 전이(+지급물 회수).
    {
      const { data: payOrder } = await admin
        .from("payments")
        .select("order_id")
        .eq("payment_id", pay.payment_id)
        .maybeSingle();
      if (payOrder?.order_id) {
        await markOrderRefundedAndRevoke(payOrder.order_id, reason);
      }
    }
    return { ok: true, refunded: true, accessUntil: null };
  }

  // 3일 경과 — 환불 없음. 정기결제만 해지(다음 갱신 청구 없음), 남은 기간 이용.
  await admin
    .from("user_subscriptions")
    .update({ auto_renew: false, cancelled_at: nowIso, updated_at: nowIso })
    .eq("subscription_id", sub.subscription_id);
  return { ok: true, refunded: false, accessUntil: sub.expires_at };
}

// ─── 자동결제(빌링) — feat-8-028 Stage 5 ───
// 첫 등록: requestBillingAuth(클라) → authKey → issueAndSaveBillingKey → 첫 달 청구.
// 갱신: billing-charge 크론이 만료 임박 auto_renew 구독을 chargeDueRenewals 로 청구.

const TOSS_API = "https://api.tosspayments.com/v1";

function tossBasicAuth(): string | null {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) return null;
  return Buffer.from(`${secret}:`).toString("base64");
}

// authKey → billingKey 발급 후 저장(카드 1개 유지: 기존 것 soft-delete).
export async function issueAndSaveBillingKey(input: {
  userId: string;
  authKey: string;
  customerKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const basic = tossBasicAuth();
  if (!basic) return { ok: false, error: "TOSS_SECRET_KEY 환경변수 미설정" };
  let payload: Record<string, unknown>;
  try {
    const res = await fetch(`${TOSS_API}/billing/authorizations/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authKey: input.authKey,
        customerKey: input.customerKey,
      }),
    });
    payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof payload?.message === "string"
          ? payload.message
          : `빌링키 발급 실패 (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
  } catch (e) {
    return {
      ok: false,
      error: `빌링키 발급 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const billingKey =
    typeof payload.billingKey === "string" ? payload.billingKey : null;
  if (!billingKey) return { ok: false, error: "빌링키 응답 형식 오류" };
  const card = (payload.card ?? {}) as Record<string, unknown>;
  const admin = adminClient as SupabaseClient<Database>;
  await admin
    .from("billing_keys")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("deleted_at", null);
  await admin.from("billing_keys").insert({
    user_id: input.userId,
    billing_key: billingKey,
    customer_key: input.customerKey,
    card_company: typeof card.company === "string" ? card.company : null,
    card_number_masked: typeof card.number === "string" ? card.number : null,
  });
  return { ok: true };
}

// 빌링키로 즉시 청구.
async function chargeBillingKey(input: {
  billingKey: string;
  customerKey: string;
  amountKrw: number;
  orderId: string;
  orderName: string;
}): Promise<
  | { ok: true; paymentKey: string; payload: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const basic = tossBasicAuth();
  if (!basic) return { ok: false, error: "TOSS_SECRET_KEY 환경변수 미설정" };
  try {
    const res = await fetch(`${TOSS_API}/billing/${input.billingKey}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerKey: input.customerKey,
        amount: input.amountKrw,
        orderId: input.orderId,
        orderName: input.orderName,
      }),
    });
    const payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof payload?.message === "string"
          ? payload.message
          : `자동결제 실패 (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      paymentKey:
        typeof payload.paymentKey === "string" ? payload.paymentKey : "",
      payload,
    };
  } catch (e) {
    return {
      ok: false,
      error: `자동결제 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// 완료된 결제 1건 기록(빌링 청구 후). 반환 paymentId.
async function recordCompletedBillingPayment(
  admin: SupabaseClient<Database>,
  input: {
    userId: string;
    planId: string;
    amountKrw: number;
    discountId: string | null;
    tossOrderId: string;
    tossPaymentKey: string;
    tossPayload: Record<string, unknown>;
  },
): Promise<string | null> {
  const { data } = await admin
    .from("payments")
    .insert({
      user_id: input.userId,
      plan_id: input.planId,
      amount_krw: input.amountKrw,
      status: "completed",
      toss_order_id: input.tossOrderId,
      toss_payment_key: input.tossPaymentKey,
      toss_response: input.tossPayload as never,
      discount_id: input.discountId,
    })
    .select("payment_id")
    .single();
  return data?.payment_id ?? null;
}

// 빌링키 발급 직후 첫 달 청구 + 구독 활성화(auto_renew=true).
export async function chargeAndActivateBilling(input: {
  userId: string;
  customerKey: string;
  plan: SubscriptionPlan;
  amountKrw: number;
  discountId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: bk } = await admin
    .from("billing_keys")
    .select("billing_key, customer_key")
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bk) return { ok: false, error: "등록된 자동결제 카드가 없습니다" };

  const orderId = `lidam-b-${randomUUID()}`;
  const charge = await chargeBillingKey({
    billingKey: bk.billing_key,
    customerKey: bk.customer_key,
    amountKrw: input.amountKrw,
    orderId,
    orderName: input.plan.name,
  });
  if (!charge.ok) return { ok: false, error: charge.error };

  const paymentId = await recordCompletedBillingPayment(admin, {
    userId: input.userId,
    planId: input.plan.planId,
    amountKrw: input.amountKrw,
    discountId: input.discountId,
    tossOrderId: orderId,
    tossPaymentKey: charge.paymentKey,
    tossPayload: charge.payload,
  });
  if (!paymentId) return { ok: false, error: "결제 기록 실패" };
  if (input.discountId) await incrementDiscountUse(input.discountId);

  const res = await upsertPaidSubscription(admin, {
    userId: input.userId,
    planId: input.plan.planId,
    subjectCode: null,
    durationDays: input.plan.durationDays,
    paymentId,
    autoRenew: true,
  });
  if ("error" in res) return { ok: false, error: res.error };
  return { ok: true };
}

// 갱신 청구(크론) — 만료 임박 auto_renew 구독을 빌링키로 청구·연장.
// 대상: status=active · auto_renew=true · cancelled_at IS NULL · 만료 24h 이내.
export async function chargeDueRenewals(): Promise<{
  charged: number;
  failed: number;
}> {
  const admin = adminClient as SupabaseClient<Database>;
  const nowMs = Date.now();
  const windowIso = new Date(nowMs + 24 * 3_600_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const { data: due } = await admin
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, subject_code, subscription_plans!inner(code, name, price_krw, duration_days, product_kind)",
    )
    .eq("status", "active")
    .eq("auto_renew", true)
    .is("cancelled_at", null)
    .lte("expires_at", windowIso)
    .gte("expires_at", nowIso);

  // 갱신 할인 = '지속' 모델: 신규 프로모션을 새로 부여하지 않고, 그 구독이 원래
  //   받던 할인(직전 완료 결제의 discount_id)을 혜택 지속 종료일(renewal_until)까지
  //   유지한다. 가입 창에 시작해 지속 중인 구독만 혜택을 이어받는다.
  const activeDiscounts = await listActiveDiscounts(admin);
  const discountById = new Map(
    activeDiscounts.map((d) => [d.discountId, d] as const),
  );

  let charged = 0;
  let failed = 0;
  for (const sub of due ?? []) {
    const { data: bk } = await admin
      .from("billing_keys")
      .select("billing_key, customer_key")
      .eq("user_id", sub.user_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bk) {
      failed += 1;
      continue;
    }
    const plan = sub.subscription_plans;
    // 직전 완료 결제(가장 최근) — 할인 체인의 연속성 판정 기준.
    //   직전 결제에 할인이 붙어 있었고 그 할인이 아직 지속 유효하면 이어간다.
    let priorQuery = admin
      .from("payments")
      .select("discount_id")
      .eq("user_id", sub.user_id)
      .eq("plan_id", sub.plan_id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    priorQuery = sub.subject_code
      ? priorQuery.eq("subject_code", sub.subject_code)
      : priorQuery.is("subject_code", null);
    const { data: prior } = await priorQuery.maybeSingle();
    const priorDiscount = prior?.discount_id
      ? (discountById.get(prior.discount_id) ?? null)
      : null;
    const auto =
      priorDiscount &&
      discountAppliesAtRenewal(
        priorDiscount,
        { productKind: plan.product_kind as ProductKind, code: plan.code },
        plan.price_krw,
        nowMs,
      )
        ? priorDiscount
        : null;
    const amount = auto
      ? effectivePriceKrw(plan.price_krw, auto)
      : plan.price_krw;
    // 할인 후 0원이면 청구 불가 → 할인 없이 정가 청구(0원 청구 회피).
    const chargeAmount = amount > 0 ? amount : plan.price_krw;
    const appliedDiscountId = amount > 0 && auto ? auto.discountId : null;
    const orderId = `lidam-r-${randomUUID()}`;
    const charge = await chargeBillingKey({
      billingKey: bk.billing_key,
      customerKey: bk.customer_key,
      amountKrw: chargeAmount,
      orderId,
      orderName: `${plan.name} 자동갱신`,
    });
    if (!charge.ok) {
      failed += 1;
      continue;
    }
    const paymentId = await recordCompletedBillingPayment(admin, {
      userId: sub.user_id,
      planId: sub.plan_id,
      amountKrw: chargeAmount,
      discountId: appliedDiscountId,
      tossOrderId: orderId,
      tossPaymentKey: charge.paymentKey,
      tossPayload: charge.payload,
    });
    if (!paymentId) {
      failed += 1;
      continue;
    }
    if (appliedDiscountId) await incrementDiscountUse(appliedDiscountId);
    await upsertPaidSubscription(admin, {
      userId: sub.user_id,
      planId: sub.plan_id,
      subjectCode: sub.subject_code ?? null,
      durationDays: plan.duration_days,
      paymentId,
      autoRenew: true,
    });
    charged += 1;
  }
  return { charged, failed };
}

// 본인 자동결제 카드 조회(표시용).
export async function getActiveBillingKey(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<{ cardCompany: string | null; cardMasked: string | null } | null> {
  const { data } = await client
    .from("billing_keys")
    .select("card_company, card_number_masked")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    cardCompany: data.card_company,
    cardMasked: data.card_number_masked,
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

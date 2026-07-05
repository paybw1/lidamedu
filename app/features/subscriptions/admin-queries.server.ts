// feat-7-014 — 운영자(manager+) 수강권/결제 관리 쿼리.
// 호출부에서 권한(manager+) 검증 필수. admin client(service_role) 사용 — RLS 우회.

import type { Json } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type {
  PaymentRow,
  PaymentStatus,
  SubscriptionStatus,
  UserSubscription,
} from "./labels";

// ── 단일 사용자 ──────────────────────────────────────────────────────────

export interface SubscriptionWithUser extends UserSubscription {
  email: string | null;
  displayName: string | null;
  totalPaidKrw: number;
  /** 수동 부여(결제 없음) 여부 — granted_by 존재. */
  manualGrant: boolean;
  /** 최근 운영자 조정 메모. */
  adminNote: string | null;
}

function rowToSubscription(row: {
  subscription_id: string;
  user_id: string;
  plan_id: string;
  started_at: string;
  expires_at: string;
  status: string;
  payment_id: string | null;
  subscription_plans: { code: string; name: string } | null;
}): UserSubscription {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    planId: row.plan_id,
    planCode: row.subscription_plans?.code ?? "",
    planName: row.subscription_plans?.name ?? "",
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    status: row.status as SubscriptionStatus,
    paymentId: row.payment_id,
  };
}

export async function listUserSubscriptionHistory(
  userId: string,
): Promise<UserSubscription[]> {
  const { data, error } = await adminClient
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, subscription_plans!inner(code, name)",
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSubscription);
}

export async function listPaymentsForUser(
  userId: string,
): Promise<PaymentRow[]> {
  const { data, error } = await adminClient
    .from("payments")
    .select(
      "payment_id, user_id, plan_id, amount_krw, status, toss_order_id, toss_payment_key, failure_reason, created_at, subscription_plans!inner(code, name)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    paymentId: r.payment_id,
    userId: r.user_id,
    planId: r.plan_id,
    planCode: r.subscription_plans?.code ?? "",
    planName: r.subscription_plans?.name ?? "",
    amountKrw: r.amount_krw,
    status: r.status as PaymentStatus,
    tossOrderId: r.toss_order_id,
    tossPaymentKey: r.toss_payment_key,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
  }));
}

// ── 전체 list (운영자 화면) ───────────────────────────────────────────────

export interface ListAdminSubscriptionsOptions {
  planCode?: string;
  status?: SubscriptionStatus | "all";
  /** N일 이내 만료 (활성 only). null 이면 미적용. */
  expiringInDays?: number;
  search?: string;
  limit?: number;
}

/**
 * 사용자별 가장 최근 구독 row 반환 (한 사용자 = 한 줄).
 * status 필터 없으면 전체. expiringInDays 는 active 중 만료 임박 필터.
 */
export async function listAllSubscriptions(
  opts: ListAdminSubscriptionsOptions = {},
): Promise<SubscriptionWithUser[]> {
  let q = adminClient
    .from("user_subscriptions")
    .select(
      "subscription_id, user_id, plan_id, started_at, expires_at, status, payment_id, granted_by, admin_note, subscription_plans!inner(code, name), profiles!user_id!inner(profile_id, name)",
    )
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.planCode) q = q.eq("subscription_plans.code", opts.planCode);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.expiringInDays !== undefined && opts.expiringInDays > 0) {
    const cutoff = new Date(
      Date.now() + opts.expiringInDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    q = q
      .eq("status", "active")
      .lte("expires_at", cutoff)
      .gte("expires_at", new Date().toISOString());
  }
  if (opts.search && opts.search.trim().length > 0) {
    const s = opts.search.trim().replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${s}%`;
    q = q.or(`name.ilike.${pattern}`, { foreignTable: "profiles" });
  }
  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 사용자별 결제 합계 — 한 query.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: paySum } = await adminClient
    .from("payments")
    .select("user_id, amount_krw, status")
    .in("user_id", userIds)
    .eq("status", "completed");
  const sumByUser = new Map<string, number>();
  for (const p of paySum ?? []) {
    sumByUser.set(p.user_id, (sumByUser.get(p.user_id) ?? 0) + p.amount_krw);
  }

  // email 은 auth.users 에서. admin.listUsers 로 batch 조회.
  const emailByUser = new Map<string, string>();
  try {
    const { data: usersData } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });
    for (const u of usersData.users ?? []) {
      if (u.email && userIds.includes(u.id)) emailByUser.set(u.id, u.email);
    }
  } catch {
    // listUsers 실패는 silent — name 만 표시.
  }

  // 사용자별 최근 1건만 (status 정렬 후 첫 row).
  const seen = new Set<string>();
  const out: SubscriptionWithUser[] = [];
  rows.sort((a, b) => {
    const ap = a.status === "active" ? 0 : 1;
    const bp = b.status === "active" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return b.started_at.localeCompare(a.started_at);
  });
  for (const r of rows) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    const sub = rowToSubscription(r);
    out.push({
      ...sub,
      email: emailByUser.get(r.user_id) ?? null,
      displayName: r.profiles?.name ?? null,
      totalPaidKrw: sumByUser.get(r.user_id) ?? 0,
      manualGrant: r.granted_by != null,
      adminNote: r.admin_note ?? null,
    });
  }
  return out;
}

// ── 액션: 수동 부여 / 연장 / 취소 (전부 감사 로그 기록) ─────────────────────

async function writeAdminLog(entry: {
  subscriptionId: string | null;
  userId: string;
  actorId: string;
  action: "grant" | "extend" | "cancel" | "auto_cancel";
  detail: Record<string, unknown>;
  note: string | null;
}): Promise<void> {
  // 로그 실패가 본 작업을 되돌리진 않는다 — 다만 조용히 삼키지 않고 서버 로그에 남긴다.
  const { error } = await adminClient.from("subscription_admin_logs").insert({
    subscription_id: entry.subscriptionId,
    user_id: entry.userId,
    actor_id: entry.actorId,
    action: entry.action,
    detail: entry.detail as Json,
    note: entry.note,
  });
  if (error) console.error("[subscription_admin_logs]", error.message);
}

export interface GrantManualSubscriptionInput {
  userId: string;
  planCode: string;
  /** 추가 기간(일). 1~3650. */
  durationDays: number;
  /** 부여 사유 (감사 로그·admin_note). */
  note: string;
  /** 처리 운영자. */
  actorId: string;
}

export async function grantManualSubscription(
  input: GrantManualSubscriptionInput,
): Promise<
  | { ok: true; subscriptionId: string; expiresAt: string }
  | { ok: false; error: string }
> {
  if (input.durationDays <= 0 || input.durationDays > 3650) {
    return { ok: false, error: "durationDays 범위 1~3650" };
  }
  // 1) plan 조회 (planId, code 검증).
  const { data: plan, error: planErr } = await adminClient
    .from("subscription_plans")
    .select("plan_id, code, is_active")
    .eq("code", input.planCode)
    .maybeSingle();
  if (planErr) return { ok: false, error: planErr.message };
  if (!plan) return { ok: false, error: `plan not found: ${input.planCode}` };
  // 비활성(판매 전) 상품도 재량 부여는 허용 — 판매 게이트(pricing)와 별개. 이력에 planCode 기록.

  // 2) 기존 active 구독 확인 → 있으면 연장(같은 plan 이면), 없으면 신규.
  const { data: existing } = await adminClient
    .from("user_subscriptions")
    .select("subscription_id, plan_id, expires_at, status")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const now = new Date();
  if (existing && existing.plan_id === plan.plan_id) {
    // 같은 plan — 만료일 연장.
    const base = new Date(
      Math.max(new Date(existing.expires_at).getTime(), now.getTime()),
    );
    const next = new Date(
      base.getTime() + input.durationDays * 24 * 60 * 60 * 1000,
    );
    const { error: upErr } = await adminClient
      .from("user_subscriptions")
      .update({
        expires_at: next.toISOString(),
        granted_by: input.actorId,
        admin_note: input.note,
      })
      .eq("subscription_id", existing.subscription_id);
    if (upErr) return { ok: false, error: upErr.message };
    await writeAdminLog({
      subscriptionId: existing.subscription_id,
      userId: input.userId,
      actorId: input.actorId,
      action: "extend",
      detail: {
        planCode: plan.code,
        addDays: input.durationDays,
        beforeExpiresAt: existing.expires_at,
        afterExpiresAt: next.toISOString(),
        via: "grant_same_plan",
      },
      note: input.note,
    });
    return {
      ok: true,
      subscriptionId: existing.subscription_id,
      expiresAt: next.toISOString(),
    };
  }
  // 신규 — 기존 active 가 있으면 그건 cancelled 처리(원래 종료일까지 유지하려면 별도 정책).
  if (existing) {
    await adminClient
      .from("user_subscriptions")
      .update({ status: "cancelled", cancelled_at: now.toISOString() })
      .eq("subscription_id", existing.subscription_id);
    await writeAdminLog({
      subscriptionId: existing.subscription_id,
      userId: input.userId,
      actorId: input.actorId,
      action: "auto_cancel",
      detail: { reason: "새 상품 부여로 기존 활성 구독 자동 취소" },
      note: input.note,
    });
  }
  const expiresAt = new Date(
    now.getTime() + input.durationDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: ins, error: insErr } = await adminClient
    .from("user_subscriptions")
    .insert({
      user_id: input.userId,
      plan_id: plan.plan_id,
      payment_id: null,
      started_at: now.toISOString(),
      expires_at: expiresAt,
      status: "active",
      granted_by: input.actorId,
      admin_note: input.note,
    })
    .select("subscription_id")
    .single();
  if (insErr || !ins)
    return { ok: false, error: insErr?.message ?? "insert 실패" };
  await writeAdminLog({
    subscriptionId: ins.subscription_id,
    userId: input.userId,
    actorId: input.actorId,
    action: "grant",
    detail: { planCode: plan.code, durationDays: input.durationDays, expiresAt },
    note: input.note,
  });
  return { ok: true, subscriptionId: ins.subscription_id, expiresAt };
}

export async function extendSubscription(
  subscriptionId: string,
  addDays: number,
  note: string,
  actorId: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  if (addDays <= 0 || addDays > 3650) {
    return { ok: false, error: "addDays 범위 1~3650" };
  }
  const { data: sub, error: gErr } = await adminClient
    .from("user_subscriptions")
    .select("subscription_id, user_id, expires_at, status")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!sub) return { ok: false, error: "구독 없음" };
  const base = new Date(
    Math.max(new Date(sub.expires_at).getTime(), Date.now()),
  );
  const next = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
  const update: {
    expires_at: string;
    status?: SubscriptionStatus;
    admin_note: string;
  } = {
    expires_at: next.toISOString(),
    admin_note: note,
  };
  if (sub.status === "expired" || sub.status === "cancelled") {
    update.status = "active";
  }
  const { error } = await adminClient
    .from("user_subscriptions")
    .update(update)
    .eq("subscription_id", subscriptionId);
  if (error) return { ok: false, error: error.message };
  await writeAdminLog({
    subscriptionId,
    userId: sub.user_id,
    actorId,
    action: "extend",
    detail: {
      addDays,
      beforeExpiresAt: sub.expires_at,
      afterExpiresAt: next.toISOString(),
      reactivated: sub.status !== "active" && update.status === "active",
    },
    note,
  });
  return { ok: true, expiresAt: next.toISOString() };
}

export async function cancelSubscriptionAdmin(
  subscriptionId: string,
  note: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sub } = await adminClient
    .from("user_subscriptions")
    .select("subscription_id, user_id, status, expires_at")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) return { ok: false, error: "구독 없음" };
  const { error } = await adminClient
    .from("user_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      admin_note: note,
    })
    .eq("subscription_id", subscriptionId);
  if (error) return { ok: false, error: error.message };
  await writeAdminLog({
    subscriptionId,
    userId: sub.user_id,
    actorId,
    action: "cancel",
    detail: { beforeStatus: sub.status, beforeExpiresAt: sub.expires_at },
    note,
  });
  return { ok: true };
}

// ── 부여 대상 학생 검색 + 조정 이력 ──────────────────────────────────────

export interface StudentCandidate {
  userId: string;
  name: string | null;
  nickname: string | null;
  memberNo: number | null;
}

/** 수강권 부여 다이얼로그의 학생 검색 — 이름/닉네임 부분일치 또는 회원번호 정확일치. */
export async function searchStudentsForGrant(
  query: string,
): Promise<StudentCandidate[]> {
  const q = query.trim().replaceAll("%", "").replaceAll(",", " ");
  if (!q) return [];
  let builder = adminClient
    .from("profiles")
    .select("profile_id, name, nickname, member_no")
    .eq("role", "student")
    .limit(8);
  builder = /^\d+$/.test(q)
    ? builder.eq("member_no", Number(q))
    : builder.or(`name.ilike.%${q}%,nickname.ilike.%${q}%`);
  const { data, error } = await builder;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.profile_id,
    name: r.name,
    nickname: r.nickname,
    memberNo: r.member_no,
  }));
}

export interface SubscriptionAdminLogRow {
  logId: string;
  subscriptionId: string | null;
  action: "grant" | "extend" | "cancel" | "auto_cancel";
  detail: Record<string, unknown> | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

/** 목록에 표시된 구독들의 조정 이력 — subscription_id 기준 묶음 조회. */
export async function listSubscriptionAdminLogs(
  subscriptionIds: string[],
): Promise<Record<string, SubscriptionAdminLogRow[]>> {
  if (subscriptionIds.length === 0) return {};
  const out: Record<string, SubscriptionAdminLogRow[]> = {};
  for (let i = 0; i < subscriptionIds.length; i += 150) {
    const { data, error } = await adminClient
      .from("subscription_admin_logs")
      .select(
        "log_id, subscription_id, action, detail, note, created_at, actor:profiles!actor_id(name)",
      )
      .in("subscription_id", subscriptionIds.slice(i, i + 150))
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const r of data ?? []) {
      if (!r.subscription_id) continue;
      (out[r.subscription_id] ??= []).push({
        logId: r.log_id,
        subscriptionId: r.subscription_id,
        action: r.action as SubscriptionAdminLogRow["action"],
        detail: (r.detail as Record<string, unknown> | null) ?? null,
        note: r.note,
        actorName: r.actor?.name ?? null,
        createdAt: r.created_at,
      });
    }
  }
  return out;
}

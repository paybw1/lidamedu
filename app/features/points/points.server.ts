// feat-11-011 — 포인트 적립 엔진.
// 요청서(리담변리사학원 포인트정책)의 정책 13종을 DB(point_policies)에서 읽어 판정한다.
// ★코드에 적립량을 박지 않는다 — 적립량·한도·사용여부는 운영자가 화면에서 고친다.
//
// 부르는 쪽은 "무슨 일이 일어났는지"만 말한다:
//   awardPoints({ policyKey: "signup", userId, refId: userId })
// 켜져 있는지·얼마인지·중복인지는 전부 여기서 판단한다.

import adminClient from "~/core/lib/supa-admin-client.server";

export type PointPolicyKey =
  | "login"
  | "signup"
  | "payment_complete"
  | "lesson_complete"
  | "course_complete"
  | "course_review"
  | "survey"
  | "exam_submit"
  | "assignment_submit"
  | "discussion_submit"
  | "post_write"
  | "book_review"
  | "product_review";

export interface PointPolicy {
  policyKey: string;
  label: string;
  criteria: string;
  awardType: "fixed" | "percent";
  awardValue: number;
  limitKind: "once" | "every" | "daily";
  dailyCap: number | null;
  isActive: boolean;
  hookReady: boolean;
  sortOrder: number;
}

export type AwardResult =
  | { ok: true; awarded: number; balance: number }
  | { ok: false; skipped: "inactive" | "duplicate" | "daily_cap" | "zero" | "error"; error?: string };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** KST 달력일 — 하루 한도는 서버 시간이 아니라 한국 날짜로 센다. */
function kstDate(d = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function listPointPolicies(): Promise<PointPolicy[]> {
  const { data, error } = await adminClient
    .from("point_policies")
    .select(
      "policy_key, label, criteria, award_type, award_value, limit_kind, daily_cap, is_active, hook_ready, sort_order",
    )
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    policyKey: r.policy_key,
    label: r.label,
    criteria: r.criteria,
    awardType: r.award_type as "fixed" | "percent",
    awardValue: Number(r.award_value),
    limitKind: r.limit_kind as "once" | "every" | "daily",
    dailyCap: r.daily_cap,
    isActive: r.is_active,
    hookReady: r.hook_ready,
    sortOrder: r.sort_order,
  }));
}

export async function getPointBalance(userId: string): Promise<number> {
  const { data } = await adminClient
    .from("point_transactions")
    .select("delta")
    .eq("user_id", userId);
  return (data ?? []).reduce((s, t) => s + t.delta, 0);
}

/**
 * 정책에 따라 포인트를 적립한다.
 *
 * `refId` 는 "무엇에 대한 적립인가"의 식별자다(차시 id, 후기 id, 주문 id…).
 * DB 의 부분 UNIQUE 인덱스가 (user, policy, refType, refId) 중복을 막으므로,
 * 훅이 두 번 불려도 두 번 적립되지 않는다 — **애플리케이션 카운트로 막지 않는다.**
 *
 * @param baseAmountKrw percent 정책일 때의 기준 금액(결제액).
 */
export async function awardPoints(input: {
  policyKey: PointPolicyKey;
  userId: string;
  refType: string;
  refId: string;
  baseAmountKrw?: number;
  orderId?: string | null;
  reason?: string;
}): Promise<AwardResult> {
  const { data: p } = await adminClient
    .from("point_policies")
    .select("policy_key, label, award_type, award_value, limit_kind, daily_cap, is_active")
    .eq("policy_key", input.policyKey)
    .maybeSingle();
  if (!p || !p.is_active) return { ok: false, skipped: "inactive" };

  // ★이미 이 대상에 적립됐으면 여기서 끝낸다. 정합성은 UNIQUE 인덱스가 지키지만,
  //   하트비트처럼 자주 불리는 훅에서 매번 잔액 합산·insert 를 시도하는 건 낭비다.
  {
    const { count } = await adminClient
      .from("point_transactions")
      .select("txn_id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("policy_key", input.policyKey)
      .eq("ref_type", input.refType)
      .eq("ref_id", input.refId);
    if ((count ?? 0) > 0) return { ok: false, skipped: "duplicate" };
  }

  const amount =
    p.award_type === "percent"
      ? Math.floor(((input.baseAmountKrw ?? 0) * Number(p.award_value)) / 100)
      : Math.floor(Number(p.award_value));
  if (amount <= 0) return { ok: false, skipped: "zero" };

  // 하루 한도 — KST 달력일 기준으로 오늘 이 정책으로 적립된 건수를 센다.
  if (p.limit_kind === "daily" && p.daily_cap) {
    const startUtc = new Date(`${kstDate()}T00:00:00+09:00`).toISOString();
    const { count } = await adminClient
      .from("point_transactions")
      .select("txn_id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("policy_key", input.policyKey)
      .gte("created_at", startUtc);
    if ((count ?? 0) >= p.daily_cap) return { ok: false, skipped: "daily_cap" };
  }

  const balance = await getPointBalance(input.userId);
  const { error } = await adminClient.from("point_transactions").insert({
    user_id: input.userId,
    delta: amount,
    reason: input.reason ?? p.label,
    balance_after: balance + amount,
    kind: "earn",
    policy_key: input.policyKey,
    ref_type: input.refType,
    ref_id: input.refId,
    order_id: input.orderId ?? null,
  });
  if (error) {
    // 23505 = 중복 — 같은 대상에 이미 적립됨. 실패가 아니라 정상 흐름이다.
    if (error.code === "23505") return { ok: false, skipped: "duplicate" };
    return { ok: false, skipped: "error", error: error.message };
  }
  return { ok: true, awarded: amount, balance: balance + amount };
}

/** 가입 포인트를 소급 없이 지급 — 가입 후 이 시간 안의 계정만 대상. */
const SIGNUP_AWARD_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 가입 포인트. 로그인 완주 시점에 부르되 **최근 가입자에게만** 준다.
 *
 * ★UNIQUE 인덱스만 믿고 로그인마다 부르면 1인 1회는 지켜지지만, 정책을 켜는 순간
 *   기존 회원 전원이 다음 로그인에 가입 포인트를 받게 된다. 그건 지급이 아니라 사고다.
 */
export async function awardSignupPointsIfNew(userId: string): Promise<void> {
  const { data: prof } = await adminClient
    .from("profiles")
    .select("created_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!prof?.created_at) return;
  if (Date.now() - new Date(prof.created_at).getTime() > SIGNUP_AWARD_WINDOW_MS) return;
  await awardPoints({
    policyKey: "signup",
    userId,
    refType: "profile",
    refId: userId,
  });
}

/** 적립을 되돌린다(환불·후기 삭제 등). 음수 레코드를 더한다 — 기존 행은 지우지 않는다. */
export async function revokePoints(input: {
  policyKey: PointPolicyKey;
  userId: string;
  refType: string;
  refId: string;
  reason: string;
  actorId?: string | null;
}): Promise<{ ok: boolean; revoked: number }> {
  const { data: earned } = await adminClient
    .from("point_transactions")
    .select("delta")
    .eq("user_id", input.userId)
    .eq("policy_key", input.policyKey)
    .eq("ref_type", input.refType)
    .eq("ref_id", input.refId)
    .eq("kind", "earn");
  const total = (earned ?? []).reduce((s, t) => s + t.delta, 0);
  if (total <= 0) return { ok: true, revoked: 0 };

  const balance = await getPointBalance(input.userId);
  const { error } = await adminClient.from("point_transactions").insert({
    user_id: input.userId,
    delta: -total,
    reason: input.reason,
    balance_after: balance - total,
    kind: "revoke",
    policy_key: input.policyKey,
    ref_type: `${input.refType}:revoke`,
    ref_id: input.refId,
    actor_id: input.actorId ?? null,
  });
  return { ok: !error, revoked: error ? 0 : total };
}

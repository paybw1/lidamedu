// feat-13 쿠폰 개별 발급(grants) — 운영자가 특정 회원에게 비공용 쿠폰 지급/회수.
// 전부 adminClient(coupon_grants 는 self-read 만, 쓰기 정책 없음 → service_role 로).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

const admin = adminClient as SupabaseClient<Database>;

export type CouponGrantRow = {
  grantId: string;
  userId: string;
  name: string;
  email: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  usedAt: string | null; // redemption 있으면 사용 시각
};

// 이메일로 회원 조회(auth.users) — 정확 일치.
async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return null;
  const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
  return hit?.id ?? null;
}

export async function listCouponGrants(couponId: string): Promise<CouponGrantRow[]> {
  const { data: grants } = await admin
    .from("coupon_grants")
    .select("grant_id, user_id, granted_at, expires_at, revoked_at")
    .eq("coupon_id", couponId)
    .order("granted_at", { ascending: false });
  const rows = grants ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: profs }, authList, { data: reds }] = await Promise.all([
    admin.from("profiles").select("profile_id, name").in("profile_id", userIds),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin
      .from("coupon_redemptions")
      .select("user_id, redeemed_at")
      .eq("coupon_id", couponId)
      .in("user_id", userIds),
  ]);
  const nameById = new Map((profs ?? []).map((p) => [p.profile_id, p.name]));
  const emailById = new Map(
    authList.data.users.map((u) => [u.id, u.email ?? null]),
  );
  const usedById = new Map(
    (reds ?? []).map((r) => [r.user_id, r.redeemed_at]),
  );

  return rows.map((r) => ({
    grantId: r.grant_id,
    userId: r.user_id,
    name: nameById.get(r.user_id) ?? "",
    email: emailById.get(r.user_id) ?? null,
    grantedAt: r.granted_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    usedAt: usedById.get(r.user_id) ?? null,
  }));
}

/** 이메일로 개별 발급(멱등: 이미 발급됐고 회수 안 됐으면 재발급 없이 성공). */
export async function grantCouponToEmail(input: {
  couponId: string;
  email: string;
  grantedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: coupon } = await admin
    .from("coupons")
    .select("coupon_id, is_shared, usable_days, valid_to")
    .eq("coupon_id", input.couponId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!coupon) return { ok: false, error: "쿠폰을 찾을 수 없습니다." };
  if (coupon.is_shared)
    return { ok: false, error: "공용 쿠폰은 개별 발급 대상이 아닙니다." };

  const userId = await findUserIdByEmail(input.email);
  if (!userId) return { ok: false, error: "해당 이메일의 회원을 찾을 수 없습니다." };

  const expiresAt = coupon.usable_days
    ? new Date(Date.now() + coupon.usable_days * 86400_000).toISOString()
    : null;

  // 이미 발급된 건이 회수 상태면 되살리고, 아니면 신규 insert.
  const { data: existing } = await admin
    .from("coupon_grants")
    .select("grant_id, revoked_at")
    .eq("coupon_id", input.couponId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    if (!existing.revoked_at) return { ok: true }; // 이미 유효 발급(멱등)
    const { error } = await admin
      .from("coupon_grants")
      .update({ revoked_at: null, granted_at: new Date().toISOString(), expires_at: expiresAt, granted_by: input.grantedBy })
      .eq("grant_id", existing.grant_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await admin.from("coupon_grants").insert({
    coupon_id: input.couponId,
    user_id: userId,
    granted_by: input.grantedBy,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeCouponGrant(grantId: string): Promise<void> {
  await admin
    .from("coupon_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("grant_id", grantId)
    .is("revoked_at", null);
}

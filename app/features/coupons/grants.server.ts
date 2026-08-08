// feat-13 쿠폰 개별 발급(grants) — 운영자가 특정 회원에게 비공용 쿠폰 지급/회수.
// 전부 adminClient(coupon_grants 는 self-read 만, 쓰기 정책 없음 → service_role 로).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { createUserNotifications } from "~/features/notifications/queries.server";

const admin = adminClient as SupabaseClient<Database>;

// 쿠폰함 — 발급 알림의 이동 경로.
const COUPON_BOX_HREF = "/lecture/coupons";

/** 발급받은 회원에게 인박스 알림 — 쿠폰함을 열어보기 전엔 받은 사실을 알 수 없던 문제. */
async function notifyCouponGranted(input: {
  recipientIds: string[];
  couponId: string;
  couponName: string;
  expiresAt: string | null;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;
  const until = input.expiresAt
    ? `${input.expiresAt.slice(0, 10)}까지 사용할 수 있습니다.`
    : "사용 기한이 따로 없습니다.";
  await createUserNotifications({
    recipientIds: input.recipientIds,
    kind: "coupon_granted",
    entityType: "coupon",
    entityId: input.couponId,
    title: `쿠폰이 발급되었습니다 — ${input.couponName}`,
    body: `쿠폰함에서 확인하실 수 있습니다. ${until}`,
    href: COUPON_BOX_HREF,
  });
}

export type CouponGrantRow = {
  grantId: string;
  userId: string;
  name: string;
  email: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  usedAt: string | null; // redemption 있으면 사용 시각
  note: string | null; // 발급 사유/관리자 메모 (feat-11-008)
};

// auth.users 전체를 페이지네이션으로 순회 — feat-11-008 P1: 기존 1페이지(1000명) 캡은
// 회원 1,000명 초과 시 조용히 실패하는 버그였음. 상한 50페이지(5만 명) 백스톱.
async function listAllAuthUsers(): Promise<
  Array<{ id: string; email: string | null }>
> {
  const out: Array<{ id: string; email: string | null }> = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) break;
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null })));
    if (data.users.length < 1000) break;
  }
  return out;
}

// 이메일로 회원 조회(auth.users) — 정확 일치.
async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const users = await listAllAuthUsers();
  const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
  return hit?.id ?? null;
}

export interface MemberSearchRow {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  memberNo: number | null;
  role: string;
}

/** 회원 검색(발급 대상 선택용) — 이름·전화·회원번호는 profiles, 이메일은 auth.users 부분 일치.
 *  ★profiles RLS 는 staff 도 본인만 — 타 사용자 조회라 adminClient 필수(호출부 staff 게이트 전제). */
export async function searchMembersForGrant(
  q: string,
): Promise<MemberSearchRow[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const authUsers = await listAllAuthUsers();
  const emailById = new Map(authUsers.map((u) => [u.id, u.email]));

  let ids: string[] = [];
  if (query.includes("@")) {
    const ql = query.toLowerCase();
    ids = authUsers
      .filter((u) => (u.email ?? "").toLowerCase().includes(ql))
      .map((u) => u.id);
  } else {
    const memberNo = /^\d+$/.test(query) ? Number(query) : null;
    const ors = [`name.ilike.%${query}%`, `phone_e164.ilike.%${query}%`];
    if (memberNo !== null) ors.push(`member_no.eq.${memberNo}`);
    const { data } = await admin
      .from("profiles")
      .select("profile_id")
      .or(ors.join(","))
      .limit(30);
    ids = (data ?? []).map((p) => p.profile_id);
  }
  if (ids.length === 0) return [];

  const { data: profs } = await admin
    .from("profiles")
    .select("profile_id, name, phone_e164, member_no, role")
    .in("profile_id", ids.slice(0, 30));
  return (profs ?? []).map((p) => ({
    userId: p.profile_id,
    name: p.name,
    email: emailById.get(p.profile_id) ?? null,
    phone: p.phone_e164,
    memberNo: p.member_no,
    role: p.role,
  }));
}

export async function listCouponGrants(couponId: string): Promise<CouponGrantRow[]> {
  const { data: grants } = await admin
    .from("coupon_grants")
    .select("grant_id, user_id, granted_at, expires_at, revoked_at, note")
    .eq("coupon_id", couponId)
    .order("granted_at", { ascending: false });
  const rows = grants ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: profs }, authUsers, { data: reds }] = await Promise.all([
    admin.from("profiles").select("profile_id, name").in("profile_id", userIds),
    listAllAuthUsers(),
    admin
      .from("coupon_redemptions")
      .select("user_id, redeemed_at")
      .eq("coupon_id", couponId)
      .in("user_id", userIds),
  ]);
  const nameById = new Map((profs ?? []).map((p) => [p.profile_id, p.name]));
  const emailById = new Map(authUsers.map((u) => [u.id, u.email]));
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
    note: r.note,
  }));
}

type GrantOutcome = "granted" | "already" | "error";

interface GrantableCoupon {
  coupon_id: string;
  name: string;
  usable_days: number | null;
}

async function grantToUser(input: {
  coupon: GrantableCoupon;
  userId: string;
  grantedBy: string;
  note: string | null;
}): Promise<{ status: GrantOutcome; error?: string; expiresAt?: string | null }> {
  const expiresAt = input.coupon.usable_days
    ? new Date(Date.now() + input.coupon.usable_days * 86400_000).toISOString()
    : null;
  // 이미 발급된 건이 회수 상태면 되살리고, 아니면 신규 insert.
  const { data: existing } = await admin
    .from("coupon_grants")
    .select("grant_id, revoked_at")
    .eq("coupon_id", input.coupon.coupon_id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existing) {
    if (!existing.revoked_at) return { status: "already" }; // 이미 유효 발급 — 중복
    const { error } = await admin
      .from("coupon_grants")
      .update({
        revoked_at: null,
        granted_at: new Date().toISOString(),
        expires_at: expiresAt,
        granted_by: input.grantedBy,
        note: input.note,
      })
      .eq("grant_id", existing.grant_id);
    return error
      ? { status: "error", error: error.message }
      : { status: "granted", expiresAt };
  }
  const { error } = await admin.from("coupon_grants").insert({
    coupon_id: input.coupon.coupon_id,
    user_id: input.userId,
    granted_by: input.grantedBy,
    expires_at: expiresAt,
    note: input.note,
  });
  return error
    ? { status: "error", error: error.message }
    : { status: "granted", expiresAt };
}

async function loadGrantableCoupon(
  couponId: string,
): Promise<{ ok: true; coupon: GrantableCoupon } | { ok: false; error: string }> {
  const { data: coupon } = await admin
    .from("coupons")
    .select("coupon_id, name, is_shared, usable_days")
    .eq("coupon_id", couponId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!coupon) return { ok: false, error: "쿠폰을 찾을 수 없습니다." };
  if (coupon.is_shared)
    return { ok: false, error: "공용 쿠폰은 개별 발급 대상이 아닙니다." };
  return { ok: true, coupon };
}

/** 이메일로 개별 발급(멱등: 이미 발급됐고 회수 안 됐으면 재발급 없이 성공). */
export async function grantCouponToEmail(input: {
  couponId: string;
  email: string;
  grantedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadGrantableCoupon(input.couponId);
  if (!loaded.ok) return loaded;
  const userId = await findUserIdByEmail(input.email);
  if (!userId) return { ok: false, error: "해당 이메일의 회원을 찾을 수 없습니다." };
  const r = await grantToUser({
    coupon: loaded.coupon,
    userId,
    grantedBy: input.grantedBy,
    note: null,
  });
  if (r.status === "error") return { ok: false, error: r.error ?? "발급 실패" };
  if (r.status === "granted") {
    await notifyCouponGranted({
      recipientIds: [userId],
      couponId: loaded.coupon.coupon_id,
      couponName: loaded.coupon.name,
      expiresAt: r.expiresAt ?? null,
    });
  }
  return { ok: true };
}

export interface BulkGrantResult {
  granted: number;
  already: string[]; // 이미 유효 발급이던 userId(중복 안내)
  failed: Array<{ userId: string; error: string }>;
}

/** 검색·선택한 여러 회원에게 일괄 발급 — feat-11-008 P1(260807 요청서: 복수 발급·중복 확인·실패 표시). */
export async function grantCouponToUsers(input: {
  couponId: string;
  userIds: string[];
  grantedBy: string;
  note: string | null;
}): Promise<{ ok: true; result: BulkGrantResult } | { ok: false; error: string }> {
  const loaded = await loadGrantableCoupon(input.couponId);
  if (!loaded.ok) return loaded;
  const result: BulkGrantResult = { granted: 0, already: [], failed: [] };
  const notifyIds: string[] = [];
  let expiresAt: string | null = null;
  for (const userId of [...new Set(input.userIds)]) {
    const r = await grantToUser({
      coupon: loaded.coupon,
      userId,
      grantedBy: input.grantedBy,
      note: input.note,
    });
    if (r.status === "granted") {
      result.granted++;
      notifyIds.push(userId); // 새로 발급된 회원만 알린다(이미 보유·실패는 제외)
      expiresAt = r.expiresAt ?? null;
    } else if (r.status === "already") result.already.push(userId);
    else result.failed.push({ userId, error: r.error ?? "알 수 없는 오류" });
  }
  // note 는 운영자 메모라 학생 알림 본문에 넣지 않는다.
  await notifyCouponGranted({
    recipientIds: notifyIds,
    couponId: loaded.coupon.coupon_id,
    couponName: loaded.coupon.name,
    expiresAt,
  });
  return { ok: true, result };
}

export async function revokeCouponGrant(grantId: string): Promise<void> {
  await admin
    .from("coupon_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("grant_id", grantId)
    .is("revoked_at", null);
}

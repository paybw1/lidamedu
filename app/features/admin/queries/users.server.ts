// 사용자 관리 (feat-7-012) — admin 전용 사용자 일람 + 역할 변경.
// profile 정보 + auth.users 의 email 을 조합. admin client(service_role)로 fetch.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface AdminUserRow {
  profileId: string;
  /** 영구 회원번호(가입순). */
  memberNo: number | null;
  name: string;
  // 카카오 로그인으로 수집되는 프로필 정보(6-scope): 닉네임·프로필사진·이메일·전화·주소.
  nickname: string | null;
  avatarUrl: string | null;
  role: UserRole;
  email: string | null;
  phoneE164: string | null;
  address: string | null;
  marketingConsent: boolean;
  accessApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  /** 소속 반 이름들. */
  cohortNames: string[];
  /** 수강 — 활성 구독 상품명들 (+ 종합반은 cohortNames 로 표시). */
  activePlanNames: string[];
  /** 실결제금액 = 완료 결제 합 − 환불 합. */
  netPaidKrw: number;
}

export interface ListAdminUsersOptions {
  query?: string;        // 이름/이메일 substring
  role?: UserRole;       // 특정 역할만
  page?: number;
  pageSize?: number;
}

export interface AdminUsersPage {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

// auth.users 는 RLS 우회로 admin client 사용. 한 번에 전체 fetch 후 메모리 필터.
// 사용자 수 1만 이하 가정 — 그 이상으로 늘어나면 RPC 로 전환.
export async function listAdminUsers(
  options: ListAdminUsersOptions = {},
): Promise<AdminUsersPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, options.pageSize ?? 50));
  const client = adminClient;

  // profiles + auth.users + 소속·수강·결제 일괄 조회.
  const [
    { data: profileRows, error: pErr },
    authList,
    { data: memberRows },
    { data: subRows },
    { data: payRows },
  ] = await Promise.all([
    (client as SupabaseClient<Database>)
      .from("profiles")
      .select(
        "profile_id, member_no, name, nickname, avatar_url, role, phone_e164, address, marketing_consent, access_approved_at, created_at, updated_at",
      ),
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    (client as SupabaseClient<Database>)
      .from("cohort_members")
      .select("profile_id, cohorts(name)")
      .limit(5000),
    (client as SupabaseClient<Database>)
      .from("user_subscriptions")
      .select("user_id, status, expires_at, subscription_plans(name)")
      .eq("status", "active")
      .limit(5000),
    (client as SupabaseClient<Database>)
      .from("payments")
      .select("user_id, amount_krw, status, refund_amount_krw")
      .in("status", ["completed", "refunded"])
      .limit(10000),
  ]);
  if (pErr) throw pErr;
  if (authList.error) throw authList.error;

  const profilesById = new Map<string, NonNullable<typeof profileRows>[number]>();
  for (const p of profileRows ?? []) profilesById.set(p.profile_id, p);

  const cohortsByUser = new Map<string, string[]>();
  for (const m of memberRows ?? []) {
    const name = m.cohorts?.name;
    if (!name) continue;
    if (!cohortsByUser.has(m.profile_id)) cohortsByUser.set(m.profile_id, []);
    cohortsByUser.get(m.profile_id)!.push(name);
  }
  const nowIso = new Date().toISOString();
  const plansByUser = new Map<string, string[]>();
  for (const s of subRows ?? []) {
    if (s.expires_at && s.expires_at < nowIso) continue; // 만료 지난 active 잔재 제외
    const name = s.subscription_plans?.name;
    if (!name) continue;
    if (!plansByUser.has(s.user_id)) plansByUser.set(s.user_id, []);
    const list = plansByUser.get(s.user_id)!;
    if (!list.includes(name)) list.push(name);
  }
  const netByUser = new Map<string, number>();
  for (const p of payRows ?? []) {
    const net = p.amount_krw - (p.refund_amount_krw ?? 0);
    netByUser.set(p.user_id, (netByUser.get(p.user_id) ?? 0) + net);
  }

  let rows: AdminUserRow[] = authList.data.users.map((u) => {
    const profile = profilesById.get(u.id);
    return {
      profileId: u.id,
      memberNo: profile?.member_no ?? null,
      name: profile?.name ?? "",
      nickname: profile?.nickname ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      role: (profile?.role ?? "student") as UserRole,
      email: u.email ?? null,
      phoneE164: profile?.phone_e164 ?? null,
      address: profile?.address ?? null,
      marketingConsent: profile?.marketing_consent ?? false,
      accessApprovedAt: profile?.access_approved_at ?? null,
      createdAt: profile?.created_at ?? u.created_at,
      updatedAt: profile?.updated_at ?? u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmedAt: u.email_confirmed_at ?? null,
      cohortNames: cohortsByUser.get(u.id) ?? [],
      activePlanNames: plansByUser.get(u.id) ?? [],
      netPaidKrw: netByUser.get(u.id) ?? 0,
    };
  });

  // 필터.
  if (options.role) rows = rows.filter((r) => r.role === options.role);
  const trimmed = options.query?.trim().toLowerCase();
  if (trimmed) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(trimmed) ||
        (r.email ?? "").toLowerCase().includes(trimmed) ||
        (r.nickname ?? "").toLowerCase().includes(trimmed) ||
        (r.phoneE164 ?? "").toLowerCase().includes(trimmed) ||
        (r.address ?? "").toLowerCase().includes(trimmed),
    );
  }
  // 가입일 내림차순.
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = rows.length;
  const from = (page - 1) * pageSize;
  return {
    items: rows.slice(from, from + pageSize),
    total,
    page,
    pageSize,
  };
}

export async function updateUserRole(
  profileId: string,
  newRole: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = adminClient as SupabaseClient<Database>;
  const { error } = await client
    .from("profiles")
    .update({ role: newRole })
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 서비스 접근 승인/해제 — access_approved_at 은 가드 트리거로 service_role 만 변경 가능.
export async function setUserAccessApproval(
  profileId: string,
  approved: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = adminClient as SupabaseClient<Database>;
  const { error } = await client
    .from("profiles")
    .update({ access_approved_at: approved ? new Date().toISOString() : null })
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

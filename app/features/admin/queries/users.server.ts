// 사용자 관리 (feat-7-012) — admin 전용 사용자 일람 + 역할 변경.
// profile 정보 + auth.users 의 email 을 조합. admin client(service_role)로 fetch.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface AdminUserRow {
  profileId: string;
  name: string;
  role: UserRole;
  email: string | null;
  phoneE164: string | null;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
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

  // profiles + auth.users 일괄 조회.
  const [{ data: profileRows, error: pErr }, authList] = await Promise.all([
    (client as SupabaseClient<Database>)
      .from("profiles")
      .select("profile_id, name, role, phone_e164, created_at, updated_at"),
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (pErr) throw pErr;
  if (authList.error) throw authList.error;

  const profilesById = new Map<string, NonNullable<typeof profileRows>[number]>();
  for (const p of profileRows ?? []) profilesById.set(p.profile_id, p);

  let rows: AdminUserRow[] = authList.data.users.map((u) => {
    const profile = profilesById.get(u.id);
    return {
      profileId: u.id,
      name: profile?.name ?? "",
      role: (profile?.role ?? "student") as UserRole,
      email: u.email ?? null,
      phoneE164: profile?.phone_e164 ?? null,
      createdAt: profile?.created_at ?? u.created_at,
      updatedAt: profile?.updated_at ?? u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmedAt: u.email_confirmed_at ?? null,
    };
  });

  // 필터.
  if (options.role) rows = rows.filter((r) => r.role === options.role);
  const trimmed = options.query?.trim().toLowerCase();
  if (trimmed) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(trimmed) ||
        (r.email ?? "").toLowerCase().includes(trimmed),
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

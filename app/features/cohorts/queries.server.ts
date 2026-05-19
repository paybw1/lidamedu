// 반/기수(cohorts) 서버 쿼리.
// admin: 전부. instructor: 본인 소유 반 + 멤버 관리. student: 자기가 속한 반 read.
// 타입은 ./labels — 클라 안전 import.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import type { UserRole } from "~/core/lib/roles";

import type { CohortListItem, CohortMember } from "./labels";

export type { CohortListItem, CohortMember } from "./labels";

const LIST_COLUMNS =
  "cohort_id, name, description, owner_id, starts_on, ends_on, is_archived, created_at, updated_at, profiles!owner_id(name)";

interface CohortRow {
  cohort_id: string;
  name: string;
  description: string | null;
  owner_id: string;
  starts_on: string | null;
  ends_on: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  profiles: { name: string } | null;
}

export interface ListCohortsOptions {
  ownerId?: string; // instructor 자기 반만 보기
  query?: string;
  includeArchived?: boolean;
}

export async function listCohorts(
  client: SupabaseClient<Database>,
  options: ListCohortsOptions = {},
): Promise<CohortListItem[]> {
  let q = client.from("cohorts").select(LIST_COLUMNS).is("deleted_at", null);
  if (options.ownerId) q = q.eq("owner_id", options.ownerId);
  if (!options.includeArchived) q = q.eq("is_archived", false);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(`name.ilike.${pattern},description.ilike.${pattern}`);
  }
  const { data: rows, error } = await q
    .order("starts_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const list = (rows ?? []) as CohortRow[];
  if (list.length === 0) return [];

  // 멤버 수 일괄.
  const { data: memberRows } = await client
    .from("cohort_members")
    .select("cohort_id")
    .in(
      "cohort_id",
      list.map((c) => c.cohort_id),
    );
  const memberCount = new Map<string, number>();
  for (const r of memberRows ?? []) {
    memberCount.set(r.cohort_id, (memberCount.get(r.cohort_id) ?? 0) + 1);
  }

  return list.map((c) => ({
    cohortId: c.cohort_id,
    name: c.name,
    description: c.description,
    ownerId: c.owner_id,
    ownerName: c.profiles?.name ?? null,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    isArchived: c.is_archived,
    memberCount: memberCount.get(c.cohort_id) ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

export async function getCohortById(
  client: SupabaseClient<Database>,
  cohortId: string,
): Promise<CohortListItem | null> {
  const { data, error } = await client
    .from("cohorts")
    .select(LIST_COLUMNS)
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("cohort_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("cohort_id", cohortId);
  const c = data as CohortRow;
  return {
    cohortId: c.cohort_id,
    name: c.name,
    description: c.description,
    ownerId: c.owner_id,
    ownerName: c.profiles?.name ?? null,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    isArchived: c.is_archived,
    memberCount: count ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// 멤버 일람 — profiles + email(admin client 로 fetch).
// 호출자(loader) 가 staff 권한 + cohort 소유 검증을 마쳤다고 가정.
// cohort_members + profiles join 도 adminClient 로 — profiles RLS(`select-own-profile`)
// 가 admin/instructor 에게도 본인만 허용해서 일반 client 로는 멤버 이름이 다 가려진다.
export async function listCohortMembers(
  _client: SupabaseClient<Database>,
  cohortId: string,
): Promise<CohortMember[]> {
  const { data, error } = await adminClient
    .from("cohort_members")
    .select(
      "profile_id, joined_at, profiles!cohort_members_profile_id_fkey(name, role)",
    )
    .eq("cohort_id", cohortId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 이메일은 admin client 로. listUsers 가 throw 하는 환경(일부 supabase 인스턴스)
  // 에서도 페이지가 깨지지 않도록 try/catch 로 graceful fallback.
  const emailById = new Map<string, string | null>();
  try {
    const authList = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!authList.error) {
      for (const u of authList.data.users)
        emailById.set(u.id, u.email ?? null);
    } else {
      console.warn(
        "[listCohortMembers] listUsers error",
        authList.error.message,
      );
    }
  } catch (e) {
    console.warn(
      "[listCohortMembers] listUsers threw — emails will be null",
      e instanceof Error ? e.message : String(e),
    );
  }

  return rows
    .filter((r) => r.profiles !== null)
    .map((r) => ({
      profileId: r.profile_id,
      name: r.profiles!.name,
      role: r.profiles!.role,
      email: emailById.get(r.profile_id) ?? null,
      joinedAt: r.joined_at,
    }));
}

export interface UpsertCohortInput {
  name: string;
  description?: string | null;
  ownerId: string;
  startsOn?: string | null;
  endsOn?: string | null;
  isArchived?: boolean;
}

export async function createCohort(
  client: SupabaseClient<Database>,
  input: UpsertCohortInput,
): Promise<{ ok: true; cohortId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("cohorts")
    .insert({
      name: input.name,
      description: input.description ?? null,
      owner_id: input.ownerId,
      starts_on: input.startsOn ?? null,
      ends_on: input.endsOn ?? null,
      is_archived: input.isArchived ?? false,
    })
    .select("cohort_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, cohortId: data.cohort_id };
}

export async function updateCohort(
  client: SupabaseClient<Database>,
  cohortId: string,
  patch: Partial<UpsertCohortInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.ownerId !== undefined) update.owner_id = patch.ownerId;
  if (patch.startsOn !== undefined) update.starts_on = patch.startsOn;
  if (patch.endsOn !== undefined) update.ends_on = patch.endsOn;
  if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("cohorts")
    .update(update)
    .eq("cohort_id", cohortId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCohort(
  client: SupabaseClient<Database>,
  cohortId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("cohorts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("cohort_id", cohortId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function addCohortMember(
  client: SupabaseClient<Database>,
  cohortId: string,
  profileId: string,
  addedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // profile 존재 확인.
  const { data: prof } = await client
    .from("profiles")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!prof) return { ok: false, error: "사용자 미존재" };
  const { error } = await client.from("cohort_members").insert({
    cohort_id: cohortId,
    profile_id: profileId,
    added_by: addedBy,
  });
  if (error) {
    if (error.code === "23505") return { ok: true }; // 이미 멤버
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeCohortMember(
  client: SupabaseClient<Database>,
  cohortId: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("cohort_members")
    .delete()
    .eq("cohort_id", cohortId)
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 이름·이메일로 학생 검색 — instructor 가 멤버 추가할 때 사용.
// admin client 로 auth.users 검색 + profiles 조회.
export interface SearchStudentResult {
  profileId: string;
  name: string;
  email: string | null;
  role: UserRole;
}

export async function searchStudents(
  query: string,
): Promise<SearchStudentResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const admin = adminClient as SupabaseClient<Database>;

  // listUsers 가 throw 하는 환경에서도 페이지가 깨지지 않도록 try/catch.
  let users: Array<{ id: string; email: string | null }> = [];
  try {
    const authList = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authList.error) {
      console.warn("[searchStudents] listUsers error", authList.error.message);
      return [];
    }
    users = authList.data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
    }));
  } catch (e) {
    console.warn(
      "[searchStudents] listUsers threw",
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("profile_id, name, role");
  const profilesById = new Map<string, NonNullable<typeof profiles>[number]>();
  for (const p of profiles ?? []) profilesById.set(p.profile_id, p);

  return users
    .map((u) => {
      const p = profilesById.get(u.id);
      return {
        profileId: u.id,
        name: p?.name ?? "",
        email: u.email,
        role: (p?.role ?? "student") as SearchStudentResult["role"],
      };
    })
    .filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    )
    .slice(0, 20);
}

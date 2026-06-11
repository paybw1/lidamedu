// feat-6-008 스터디 매칭 — 멤버 join/leave 헬퍼.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface StudyMemberItem {
  profileId: string;
  name: string;
  joinedAt: string;
}

export interface StudyMembership {
  members: StudyMemberItem[];
  total: number;
  maxMembers: number | null;
  isFull: boolean;
  isMine: boolean;
}

export async function getStudyMembership(
  client: SupabaseClient<Database>,
  postId: string,
  userId: string,
  maxMembers: number | null,
): Promise<StudyMembership> {
  const { data, error } = await client
    .from("community_study_members")
    .select("profile_id, joined_at")
    .eq("post_id", postId)
    .is("left_at", null)
    .order("joined_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const profileIds = [...new Set(rows.map((r) => r.profile_id))];
  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    // profiles RLS(`select-own-profile`)가 본인 행만 허용 → RLS client 로는 스터디
    // 개설자가 다른 멤버(지원자) 이름을 못 읽어 전부 "(이름 없음)" 으로 표시된다.
    // 멤버 표시용 이름만 adminClient(RLS 우회)로 조회. 멤버 목록 자체는 위 client 유지.
    const { data: profs } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", profileIds);
    for (const p of profs ?? []) nameMap.set(p.profile_id, p.name);
  }
  const members: StudyMemberItem[] = rows.map((r) => ({
    profileId: r.profile_id,
    name: nameMap.get(r.profile_id) ?? "(이름 없음)",
    joinedAt: r.joined_at,
  }));
  const total = members.length;
  return {
    members,
    total,
    maxMembers,
    isFull: maxMembers !== null && total >= maxMembers,
    isMine: members.some((m) => m.profileId === userId),
  };
}

export async function joinStudy(
  client: SupabaseClient<Database>,
  postId: string,
  userId: string,
  maxMembers: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) 기존 join (left_at IS NULL) 있으면 noop.
  const { data: existing } = await client
    .from("community_study_members")
    .select("profile_id, left_at")
    .eq("post_id", postId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (existing && existing.left_at === null) {
    return { ok: true };
  }

  // 2) 인원 한도 체크.
  if (maxMembers !== null) {
    const { count } = await client
      .from("community_study_members")
      .select("profile_id", { head: true, count: "exact" })
      .eq("post_id", postId)
      .is("left_at", null);
    if ((count ?? 0) >= maxMembers) {
      return { ok: false, error: "full" };
    }
  }

  // 3) upsert — 과거 left_at 있던 row 면 left_at=null 로 되돌림.
  const nowIso = new Date().toISOString();
  const { error } = await client.from("community_study_members").upsert(
    {
      post_id: postId,
      profile_id: userId,
      joined_at: nowIso,
      left_at: null,
    },
    { onConflict: "post_id,profile_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function leaveStudy(
  client: SupabaseClient<Database>,
  postId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("community_study_members")
    .update({ left_at: new Date().toISOString() })
    .eq("post_id", postId)
    .eq("profile_id", userId)
    .is("left_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

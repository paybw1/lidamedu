// 공지사항 서버 쿼리 (feat-7-011).
// staff (instructor/admin): 본인 작성 + 전부 admin / instructor 본인.
// student: 자기에게 발송된 published 만 read. RLS 가 1차 보안, 쿼리는 정렬·집계.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  isBroadcastAudience,
  scopesVisibleOn,
  type AnnouncementAudienceKind,
  type AnnouncementAudienceRow,
  type AnnouncementDetail,
  type AnnouncementListItem,
  type AnnouncementPlatformScope,
} from "./labels";

export type {
  AnnouncementAudienceKind,
  AnnouncementAudienceRow,
  AnnouncementDetail,
  AnnouncementListItem,
  AnnouncementPlatformScope,
} from "./labels";

const STAFF_COLUMNS =
  "announcement_id, title, body_md, body_html, author_id, audience_kind, platform_scope, is_pinned, published_at, created_at, updated_at, profiles!author_id(name)";

interface RawRow {
  announcement_id: string;
  title: string;
  body_md: string;
  body_html: string | null;
  author_id: string;
  audience_kind: AnnouncementAudienceKind;
  platform_scope: AnnouncementPlatformScope;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  profiles: { name: string } | null;
}

function toListItem(
  r: RawRow,
  audienceCount: number,
  readCount: number,
  isUnread?: boolean,
): AnnouncementListItem {
  return {
    announcementId: r.announcement_id,
    title: r.title,
    bodyMd: r.body_md,
    bodyHtml: r.body_html,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    audienceKind: r.audience_kind,
    platformScope: r.platform_scope,
    isPinned: r.is_pinned,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    audienceCount,
    readCount,
    isUnread,
  };
}

// staff 일람 — admin: 전체, instructor: 본인 작성분.
export interface ListStaffAnnouncementsOptions {
  authorId?: string;
  query?: string;
  includeDrafts?: boolean;
}

export async function listStaffAnnouncements(
  client: SupabaseClient<Database>,
  options: ListStaffAnnouncementsOptions = {},
): Promise<AnnouncementListItem[]> {
  let q = client
    .from("announcements")
    .select(STAFF_COLUMNS)
    .is("deleted_at", null);
  if (options.authorId) q = q.eq("author_id", options.authorId);
  if (!options.includeDrafts) q = q.not("published_at", "is", null);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    q = q.ilike("title", `%${escaped}%`);
  }
  const { data, error } = await q
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as RawRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.announcement_id);
  const [audienceCounts, readCounts] = await Promise.all([
    countAudiences(client, ids),
    countReads(client, ids),
  ]);

  return rows.map((r) =>
    toListItem(
      r,
      audienceCounts.get(r.announcement_id) ?? 0,
      readCounts.get(r.announcement_id) ?? 0,
    ),
  );
}

async function countAudiences(
  client: SupabaseClient<Database>,
  announcementIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (announcementIds.length === 0) return map;
  // admin client 로 카운트 — staff 가 자기 공지의 통계를 보려면 RLS 우회 필요할 수 있으나
  // 정책상 author 는 본인 announcement_audiences 전체 SELECT 가능하므로 client 그대로 OK.
  const { data, error } = await client
    .from("announcement_audiences")
    .select("announcement_id")
    .in("announcement_id", announcementIds);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.announcement_id, (map.get(row.announcement_id) ?? 0) + 1);
  }
  return map;
}

async function countReads(
  client: SupabaseClient<Database>,
  announcementIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (announcementIds.length === 0) return map;
  const { data, error } = await client
    .from("announcement_reads")
    .select("announcement_id")
    .in("announcement_id", announcementIds);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.announcement_id, (map.get(row.announcement_id) ?? 0) + 1);
  }
  return map;
}

export async function getAnnouncementById(
  client: SupabaseClient<Database>,
  announcementId: string,
): Promise<AnnouncementDetail | null> {
  const { data, error } = await client
    .from("announcements")
    .select(STAFF_COLUMNS)
    .eq("announcement_id", announcementId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RawRow;

  const [audienceCount, readCount, audiences] = await Promise.all([
    countAudiences(client, [announcementId]),
    countReads(client, [announcementId]),
    listAudienceRows(client, announcementId),
  ]);

  const base = toListItem(
    row,
    audienceCount.get(announcementId) ?? 0,
    readCount.get(announcementId) ?? 0,
  );
  return { ...base, audiences };
}

async function listAudienceRows(
  client: SupabaseClient<Database>,
  announcementId: string,
): Promise<AnnouncementAudienceRow[]> {
  const { data, error } = await client
    .from("announcement_audiences")
    .select("audience_type, audience_id")
    .eq("announcement_id", announcementId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const cohortIds = rows
    .filter((r) => r.audience_type === "cohort")
    .map((r) => r.audience_id);
  const userIds = rows
    .filter((r) => r.audience_type === "user")
    .map((r) => r.audience_id);

  const labelByCohort = new Map<string, string>();
  if (cohortIds.length > 0) {
    const { data: cohorts } = await client
      .from("cohorts")
      .select("cohort_id, name")
      .in("cohort_id", cohortIds);
    for (const c of cohorts ?? []) labelByCohort.set(c.cohort_id, c.name);
  }

  const labelByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", userIds);
    for (const p of profiles ?? []) labelByUser.set(p.profile_id, p.name);
  }

  return rows.map((r) => ({
    audienceType: r.audience_type,
    audienceId: r.audience_id,
    label:
      r.audience_type === "cohort"
        ? (labelByCohort.get(r.audience_id) ?? "(삭제된 반)")
        : (labelByUser.get(r.audience_id) ?? "(삭제된 사용자)"),
  }));
}

// 학생 수신함 — RLS 가 자기 발송분만 노출하므로 그대로 fetch + 읽음 여부 표시.
export interface ListInboxOptions {
  unreadOnly?: boolean;
  limit?: number;
  /** 이 화면이 속한 제품 플랫폼 — 'both' 공지는 양쪽에 모두 낀다. */
  platform: "study" | "lecture";
}

export async function listInboxAnnouncements(
  client: SupabaseClient<Database>,
  profileId: string,
  options: ListInboxOptions,
): Promise<AnnouncementListItem[]> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const { data, error } = await client
    .from("announcements")
    .select(STAFF_COLUMNS)
    .in("platform_scope", scopesVisibleOn(options.platform))
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RawRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.announcement_id);
  const { data: readRows } = await client
    .from("announcement_reads")
    .select("announcement_id")
    .eq("profile_id", profileId)
    .in("announcement_id", ids);
  const readSet = new Set((readRows ?? []).map((r) => r.announcement_id));

  let items = rows.map((r) =>
    toListItem(r, 0, 0, !readSet.has(r.announcement_id)),
  );
  if (options.unreadOnly) items = items.filter((i) => i.isUnread);
  return items;
}

// ★현재 호출부 없음(뱃지 미사용). 되살릴 때는 platform 인자를 받아
//   scopesVisibleOn() 으로 걸러야 한다 — 안 그러면 반대편 플랫폼 공지까지 세어서
//   "안 읽음 1건인데 목록엔 없음"이 된다.
export async function countUnreadForUser(
  client: SupabaseClient<Database>,
  profileId: string,
): Promise<number> {
  const { data: anns } = await client
    .from("announcements")
    .select("announcement_id")
    .limit(200);
  const ids = (anns ?? []).map((a) => a.announcement_id);
  if (ids.length === 0) return 0;
  const { data: reads } = await client
    .from("announcement_reads")
    .select("announcement_id")
    .eq("profile_id", profileId)
    .in("announcement_id", ids);
  const readSet = new Set((reads ?? []).map((r) => r.announcement_id));
  return ids.filter((id) => !readSet.has(id)).length;
}

export async function markAnnouncementRead(
  client: SupabaseClient<Database>,
  announcementId: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 이미 읽음 표시되었어도 idempotent. PK 충돌은 무시.
  const { error } = await client
    .from("announcement_reads")
    .upsert(
      { announcement_id: announcementId, profile_id: profileId },
      { onConflict: "announcement_id,profile_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface CreateAnnouncementInput {
  title: string;
  bodyMd?: string;
  bodyHtml?: string;
  authorId: string;
  audienceKind: AnnouncementAudienceKind;
  platformScope: AnnouncementPlatformScope;
  audiences: { audienceType: "cohort" | "user"; audienceId: string }[];
  isPinned: boolean;
  publish: boolean;
}

export async function createAnnouncement(
  client: SupabaseClient<Database>,
  input: CreateAnnouncementInput,
): Promise<{ ok: true; announcementId: string } | { ok: false; error: string }> {
if (!isBroadcastAudience(input.audienceKind) && input.audiences.length === 0) {
    return { ok: false, error: "대상이 비어 있습니다" };
  }
  if (isBroadcastAudience(input.audienceKind) && input.audiences.length > 0) {
    return { ok: false, error: "전체·강사 공지에는 대상을 지정할 수 없습니다" };
  }
  for (const a of input.audiences) {
    if (a.audienceType !== input.audienceKind) {
      return { ok: false, error: "대상 종류가 일치하지 않습니다" };
    }
  }
  const { data, error } = await client
    .from("announcements")
    .insert({
      title: input.title,
      body_md: input.bodyMd ?? "",
      body_html: input.bodyHtml,
      author_id: input.authorId,
      audience_kind: input.audienceKind,
      platform_scope: input.platformScope,
      is_pinned: input.isPinned,
      published_at: input.publish ? new Date().toISOString() : null,
    })
    .select("announcement_id")
    .single();
  if (error) return { ok: false, error: error.message };
  const announcementId = data.announcement_id;

  if (input.audiences.length > 0) {
    const rows = input.audiences.map((a) => ({
      announcement_id: announcementId,
      audience_type: a.audienceType,
      audience_id: a.audienceId,
      added_by: input.authorId,
    }));
    const { error: audErr } = await client
      .from("announcement_audiences")
      .insert(rows);
    if (audErr) {
      // 실패 시 rollback — 공지 row 삭제.
      await client
        .from("announcements")
        .update({ deleted_at: new Date().toISOString() })
        .eq("announcement_id", announcementId);
      return { ok: false, error: audErr.message };
    }
  }
  return { ok: true, announcementId };
}

export interface UpdateAnnouncementInput {
  title?: string;
  bodyMd?: string;
  bodyHtml?: string;
  isPinned?: boolean;
  audienceKind?: AnnouncementAudienceKind;
  platformScope?: AnnouncementPlatformScope;
  audiences?: { audienceType: "cohort" | "user"; audienceId: string }[];
  publish?: boolean; // true: 즉시 발행, false: draft 로 되돌리기, undefined: 그대로
}

export async function updateAnnouncement(
  client: SupabaseClient<Database>,
  announcementId: string,
  input: UpdateAnnouncementInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.bodyMd !== undefined) update.body_md = input.bodyMd;
  if (input.bodyHtml !== undefined) update.body_html = input.bodyHtml;
  if (input.isPinned !== undefined) update.is_pinned = input.isPinned;
  if (input.audienceKind !== undefined) update.audience_kind = input.audienceKind;
  if (input.platformScope !== undefined)
    update.platform_scope = input.platformScope;
  if (input.publish === true) update.published_at = new Date().toISOString();
  if (input.publish === false) update.published_at = null;

  if (Object.keys(update).length > 0) {
    const { error } = await client
      .from("announcements")
      .update(update)
      .eq("announcement_id", announcementId);
    if (error) return { ok: false, error: error.message };
  }

  if (input.audiences !== undefined) {
    const kind = input.audienceKind;
    if (kind !== undefined && isBroadcastAudience(kind) && input.audiences.length > 0) {
      return { ok: false, error: "전체·강사 공지에는 대상을 지정할 수 없습니다" };
    }
    if (kind !== undefined && !isBroadcastAudience(kind) && input.audiences.length === 0) {
      return { ok: false, error: "대상이 비어 있습니다" };
    }
    const { error: delErr } = await client
      .from("announcement_audiences")
      .delete()
      .eq("announcement_id", announcementId);
    if (delErr) return { ok: false, error: delErr.message };
    if (input.audiences.length > 0) {
      const rows = input.audiences.map((a) => ({
        announcement_id: announcementId,
        audience_type: a.audienceType,
        audience_id: a.audienceId,
      }));
      const { error: insErr } = await client
        .from("announcement_audiences")
        .insert(rows);
      if (insErr) return { ok: false, error: insErr.message };
    }
  }
  return { ok: true };
}

export async function deleteAnnouncement(
  client: SupabaseClient<Database>,
  announcementId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("announcements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("announcement_id", announcementId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 운영자 발송 폼 — 사용자 검색은 admin client (auth.users 이메일 매칭).
export interface AnnouncementUserSearchResult {
  profileId: string;
  name: string;
  email: string | null;
  role: "student" | "instructor" | "admin";
}

export async function searchAudienceUsers(
  query: string,
): Promise<AnnouncementUserSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const admin = adminClient as SupabaseClient<Database>;
  const authList = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authList.error) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("profile_id, name, role");
  const profilesById = new Map<string, NonNullable<typeof profiles>[number]>();
  for (const p of profiles ?? []) profilesById.set(p.profile_id, p);

  return authList.data.users
    .map((u) => {
      const p = profilesById.get(u.id);
      return {
        profileId: u.id,
        name: p?.name ?? "",
        email: u.email ?? null,
        role: (p?.role ?? "student") as AnnouncementUserSearchResult["role"],
      };
    })
    .filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    )
    .slice(0, 20);
}

export async function listAvailableCohorts(
  client: SupabaseClient<Database>,
  ownerId?: string,
): Promise<{ cohortId: string; name: string }[]> {
  let q = client
    .from("cohorts")
    .select("cohort_id, name")
    .is("deleted_at", null)
    .eq("is_archived", false);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q.order("name").limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({ cohortId: r.cohort_id, name: r.name }));
}

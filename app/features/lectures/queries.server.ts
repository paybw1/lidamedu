// 강의 시청 추적 (feat-7-029).
// curriculum_items.kind='lecture' 항목에 대한 학생 시청 진행률 + 완료 기록.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface LectureItemDetail {
  itemId: string;
  weekId: string;
  curriculumId: string;
  curriculumName: string;
  weekNumber: number;
  weekTitle: string;
  lectureTitle: string;
  lectureUrl: string;
  lectureDurationMin: number | null;
  ord: number;
}

export interface LectureView {
  viewId: string;
  viewedAt: string;
  completedAt: string | null;
  lastPositionSec: number;
  updatedAt: string;
}

// 학생이 lecture 페이지 진입 시 권한·메타 fetch.
// 학생이 그 lecture 의 curriculum 을 적용 받은 cohort 의 멤버인지 검증.
export async function getLectureItemForUser(
  itemId: string,
  userId: string,
): Promise<LectureItemDetail | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: item } = await admin
    .from("curriculum_items")
    .select(
      "item_id, week_id, ord, kind, lecture_title, lecture_url, lecture_duration_min, curriculum_weeks!inner(week_number, title, curriculum_id, curricula!inner(name))",
    )
    .eq("item_id", itemId)
    .maybeSingle();
  if (!item || item.kind !== "lecture" || !item.lecture_url) return null;
  const curriculumId = item.curriculum_weeks?.curriculum_id;
  if (!curriculumId) return null;

  // 학생 cohort 가 그 curriculum 적용 중인가
  const { data: membership } = await admin
    .from("cohort_curricula")
    .select("cohort_id, cohort_members!inner(profile_id)")
    .eq("curriculum_id", curriculumId)
    .eq("cohort_members.profile_id", userId)
    .limit(1);
  if (!membership || membership.length === 0) return null;

  return {
    itemId: item.item_id,
    weekId: item.week_id,
    curriculumId,
    curriculumName: item.curriculum_weeks!.curricula!.name,
    weekNumber: item.curriculum_weeks!.week_number,
    weekTitle: item.curriculum_weeks!.title,
    lectureTitle: item.lecture_title ?? "강의",
    lectureUrl: item.lecture_url,
    lectureDurationMin: item.lecture_duration_min,
    ord: item.ord,
  };
}

export async function getMyLectureView(
  itemId: string,
  userId: string,
): Promise<LectureView | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data } = await admin
    .from("lecture_views")
    .select(
      "view_id, viewed_at, completed_at, last_position_sec, updated_at",
    )
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!data) return null;
  return {
    viewId: data.view_id,
    viewedAt: data.viewed_at,
    completedAt: data.completed_at,
    lastPositionSec: data.last_position_sec,
    updatedAt: data.updated_at,
  };
}

export async function recordView(
  itemId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  // upsert — 첫 시청이면 insert, 이후엔 updated_at 만 갱신
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id", ignoreDuplicates: false },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markCompleted(
  itemId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateLastPosition(
  itemId: string,
  userId: string,
  positionSec: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      last_position_sec: Math.max(0, Math.floor(positionSec)),
    },
    { onConflict: "user_id,item_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 외부 영상 URL → embed URL 변환 (YouTube/Vimeo 지원, 그 외는 원본 그대로).
export function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    // 이미 embed URL 이거나 다른 호스트 → 원본
    return raw;
  } catch {
    return null;
  }
}

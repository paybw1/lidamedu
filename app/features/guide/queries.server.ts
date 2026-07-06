// 이용 가이드 허브 — 학생 읽기(RLS: 발행본만) + 운영자 CRUD(adminClient, manager+ 게이트는 호출부).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type GuideAudience = "student" | "staff";

export interface GuideArticle {
  guideId: string;
  title: string;
  category: string;
  bodyMd: string;
  youtubeUrl: string | null;
  screenKey: string | null;
  isPublished: boolean;
  displayOrder: number;
  /** student=전체 학생 노출 / staff=운영자·강사 전용(RLS 가 학생에게 숨김). */
  audience: GuideAudience;
  updatedAt: string;
}

function rowToGuide(r: {
  guide_id: string;
  title: string;
  category: string;
  body_md: string;
  youtube_url: string | null;
  screen_key: string | null;
  is_published: boolean;
  display_order: number;
  audience: string;
  updated_at: string;
}): GuideArticle {
  return {
    guideId: r.guide_id,
    title: r.title,
    category: r.category,
    bodyMd: r.body_md,
    youtubeUrl: r.youtube_url,
    screenKey: r.screen_key,
    isPublished: r.is_published,
    displayOrder: r.display_order,
    audience: r.audience === "staff" ? "staff" : "student",
    updatedAt: r.updated_at,
  };
}

const COLS =
  "guide_id, title, category, body_md, youtube_url, screen_key, is_published, display_order, audience, updated_at";

/** 학생 — 발행된 가이드 전체(카테고리·순서 정렬). RLS 가 발행본만 반환. */
export async function listPublishedGuides(
  client: SupabaseClient<Database>,
): Promise<GuideArticle[]> {
  const { data, error } = await client
    .from("guide_articles")
    .select(COLS)
    .order("category")
    .order("display_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(rowToGuide);
}

/** 학생 — 가이드 1건 (발행본만, RLS). */
export async function getPublishedGuide(
  client: SupabaseClient<Database>,
  guideId: string,
): Promise<GuideArticle | null> {
  const { data, error } = await client
    .from("guide_articles")
    .select(COLS)
    .eq("guide_id", guideId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToGuide(data) : null;
}

/** 화면 안 "?" 도움 버튼 — screen_key 로 매칭되는 발행 가이드(보통 0~1건). RLS 발행본만. */
export async function listGuidesByScreenKey(
  client: SupabaseClient<Database>,
  screenKey: string,
): Promise<GuideArticle[]> {
  const { data, error } = await client
    .from("guide_articles")
    .select(COLS)
    .eq("screen_key", screenKey)
    .order("display_order")
    .limit(5);
  if (error) throw error;
  return (data ?? []).map(rowToGuide);
}

// ── 운영자 ──────────────────────────────────────────────────────────────────

export async function listAllGuides(): Promise<GuideArticle[]> {
  const { data, error } = await adminClient
    .from("guide_articles")
    .select(COLS)
    .order("category")
    .order("display_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(rowToGuide);
}

export interface GuideInput {
  title: string;
  category: string;
  bodyMd: string;
  youtubeUrl: string | null;
  screenKey: string | null;
  isPublished: boolean;
  displayOrder: number;
  audience: GuideAudience;
}

export async function createGuide(
  input: GuideInput,
  actorId: string,
): Promise<{ ok: true; guideId: string } | { ok: false; error: string }> {
  const { data, error } = await adminClient
    .from("guide_articles")
    .insert({
      title: input.title,
      category: input.category,
      body_md: input.bodyMd,
      youtube_url: input.youtubeUrl,
      screen_key: input.screenKey,
      is_published: input.isPublished,
      display_order: input.displayOrder,
      audience: input.audience,
      created_by: actorId,
    })
    .select("guide_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, guideId: data.guide_id };
}

export async function updateGuide(
  guideId: string,
  input: GuideInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("guide_articles")
    .update({
      title: input.title,
      category: input.category,
      body_md: input.bodyMd,
      youtube_url: input.youtubeUrl,
      screen_key: input.screenKey,
      is_published: input.isPublished,
      display_order: input.displayOrder,
      audience: input.audience,
      updated_at: new Date().toISOString(),
    })
    .eq("guide_id", guideId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteGuide(
  guideId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("guide_articles")
    .delete()
    .eq("guide_id", guideId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

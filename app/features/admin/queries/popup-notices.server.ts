// 팝업 공지 — 운영자가 만드는 사이트 팝업(모달) 공지 CRUD + 학생 노출 조회.
// RLS: 노출 조건(활성+기간내) 행은 전체 공개 읽기, 쓰기·전체 열람은 manager+.
// 모든 접근은 요청 클라이언트(RLS 적용) — adminClient 불필요.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface PopupNotice {
  noticeId: string;
  title: string;
  bodyMd: string;
  /** 업로드한 디자인 이미지(public popup-notices 버킷) — 팝업에 원본 표시. */
  imageUrl: string | null;
  /** 유튜브 영상 URL — 팝업에 embed 표시. */
  youtubeUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = Database["public"]["Tables"]["popup_notices"]["Row"];

function mapRow(r: Row): PopupNotice {
  return {
    noticeId: r.notice_id,
    title: r.title,
    bodyMd: r.body_md,
    imageUrl: r.image_url,
    youtubeUrl: r.youtube_url,
    linkUrl: r.link_url,
    linkLabel: r.link_label,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 현재 노출 조건을 충족하는 공지 — RLS 노출 정책이 곧 필터라 조건 없이 select. */
export async function listActivePopupNotices(
  client: SupabaseClient<Database>,
): Promise<PopupNotice[]> {
  const { data, error } = await client
    .from("popup_notices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return []; // 공지는 부가 기능 — 실패해도 페이지를 막지 않는다.
  return (data ?? []).map(mapRow);
}

/** 운영자 목록 — manager+ RLS 정책으로 비활성·기간외 포함 전체 열람. */
export async function listAllPopupNotices(
  client: SupabaseClient<Database>,
): Promise<PopupNotice[]> {
  const { data, error } = await client
    .from("popup_notices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export interface PopupNoticeInput {
  title: string;
  bodyMd: string;
  imageUrl: string | null;
  youtubeUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export async function createPopupNotice(
  client: SupabaseClient<Database>,
  input: PopupNoticeInput,
  createdBy: string,
): Promise<{ ok: true; noticeId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("popup_notices")
    .insert({
      title: input.title,
      body_md: input.bodyMd,
      image_url: input.imageUrl,
      youtube_url: input.youtubeUrl,
      link_url: input.linkUrl,
      link_label: input.linkLabel,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_active: input.isActive,
      created_by: createdBy,
    })
    .select("notice_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, noticeId: data.notice_id };
}

export async function updatePopupNotice(
  client: SupabaseClient<Database>,
  noticeId: string,
  input: PopupNoticeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("popup_notices")
    .update({
      title: input.title,
      body_md: input.bodyMd,
      image_url: input.imageUrl,
      youtube_url: input.youtubeUrl,
      link_url: input.linkUrl,
      link_label: input.linkLabel,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("notice_id", noticeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePopupNotice(
  client: SupabaseClient<Database>,
  noticeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("popup_notices")
    .delete()
    .eq("notice_id", noticeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

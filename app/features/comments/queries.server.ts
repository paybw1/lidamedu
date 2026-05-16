// 통합 코멘트 (조문/판례/문제) 서버 쿼리.
// 폴리모픽 — target_type + target_id. staff(instructor/admin) 작성, 모두 read.
// feat-8-022: field_path 가 있으면 본문 구간에 앵커된 하이라이트형 코멘트.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type CommentTargetType = "article" | "case" | "problem";

export type CommentHighlightColor = "green" | "yellow" | "red" | "blue";

// 하이라이트형 코멘트 앵커 — user_highlights 와 동일 구조.
export interface CommentAnchor {
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  color: CommentHighlightColor;
  label: string | null;
}

export interface ContentComment {
  commentId: string;
  targetType: CommentTargetType;
  targetId: string;
  /** 메모 본문. 하이라이트형 코멘트는 null 일 수 있다. */
  bodyMd: string | null;
  authorId: string | null;
  authorName: string | null;
  isPinned: boolean;
  /** 하이라이트형 코멘트의 본문 앵커. 텍스트형 코멘트는 null. */
  anchor: CommentAnchor | null;
  createdAt: string;
  updatedAt: string;
}

const COMMENT_COLUMNS =
  "comment_id, target_type, target_id, body_md, author_id, is_pinned, field_path, start_offset, end_offset, content_hash, color, label, created_at, updated_at, profiles!content_comments_author_id_fkey(name)";

type CommentRow = {
  comment_id: string;
  target_type: string;
  target_id: string;
  body_md: string | null;
  author_id: string | null;
  is_pinned: boolean;
  field_path: string | null;
  start_offset: number | null;
  end_offset: number | null;
  content_hash: string | null;
  color: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
  profiles: { name: string | null } | null;
};

function mapComment(r: CommentRow): ContentComment {
  // 앵커는 필수 필드(field_path/offset/content_hash/color)가 모두 있을 때만 구성.
  const anchor: CommentAnchor | null =
    r.field_path !== null &&
    r.start_offset !== null &&
    r.end_offset !== null &&
    r.content_hash !== null &&
    r.color !== null
      ? {
          fieldPath: r.field_path,
          startOffset: r.start_offset,
          endOffset: r.end_offset,
          contentHash: r.content_hash,
          color: r.color as CommentHighlightColor,
          label: r.label,
        }
      : null;
  return {
    commentId: r.comment_id,
    targetType: r.target_type as CommentTargetType,
    targetId: r.target_id,
    bodyMd: r.body_md,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    isPinned: r.is_pinned,
    anchor,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 여러 target 일괄 fetch — chapter/systematic 뷰어처럼 N개 조문이 한 화면에 노출될 때.
export async function listCommentsBulk(
  client: SupabaseClient<Database>,
  targetType: CommentTargetType,
  targetIds: string[],
): Promise<Record<string, ContentComment[]>> {
  if (targetIds.length === 0) return {};
  const { data, error } = await client
    .from("content_comments")
    .select(COMMENT_COLUMNS)
    .eq("target_type", targetType)
    .in("target_id", targetIds)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, ContentComment[]> = {};
  for (const r of (data ?? []) as CommentRow[]) {
    const item = mapComment(r);
    if (!out[item.targetId]) out[item.targetId] = [];
    out[item.targetId].push(item);
  }
  return out;
}

export async function listComments(
  client: SupabaseClient<Database>,
  targetType: CommentTargetType,
  targetId: string,
): Promise<ContentComment[]> {
  const { data, error } = await client
    .from("content_comments")
    .select(COMMENT_COLUMNS)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CommentRow[]).map(mapComment);
}

export async function createComment(
  client: SupabaseClient<Database>,
  input: {
    targetType: CommentTargetType;
    targetId: string;
    authorId: string;
    /** 메모 본문. 하이라이트형 코멘트는 생략 가능. */
    bodyMd?: string | null;
    isPinned?: boolean;
    /** 하이라이트형 코멘트의 본문 앵커. 생략 시 텍스트형 코멘트. */
    anchor?: CommentAnchor;
  },
): Promise<{ ok: true; commentId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("content_comments")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      body_md: input.bodyMd ?? null,
      author_id: input.authorId,
      is_pinned: input.isPinned ?? false,
      field_path: input.anchor?.fieldPath ?? null,
      start_offset: input.anchor?.startOffset ?? null,
      end_offset: input.anchor?.endOffset ?? null,
      content_hash: input.anchor?.contentHash ?? null,
      color: input.anchor?.color ?? null,
      label: input.anchor?.label ?? null,
    })
    .select("comment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, commentId: data.comment_id };
}

export async function updateComment(
  client: SupabaseClient<Database>,
  commentId: string,
  patch: { bodyMd?: string; isPinned?: boolean; color?: CommentHighlightColor },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.bodyMd !== undefined) update.body_md = patch.bodyMd;
  if (patch.isPinned !== undefined) update.is_pinned = patch.isPinned;
  if (patch.color !== undefined) update.color = patch.color;
  if (Object.keys(update).length === 0)
    return { ok: false, error: "변경할 내용 없음" };
  const { error } = await client
    .from("content_comments")
    .update(update)
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("content_comments")
    .delete()
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

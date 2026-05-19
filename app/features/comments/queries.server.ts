// 메모 (조문/판례/문제) 서버 쿼리.
// 폴리모픽 — target_type + target_id. 강사·수험생 모두 작성.
// 가시성(feat-8-023): 강사 작성 메모는 전체 공개, 수험생 작성 메모는 본인 전용 (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type CommentTargetType = "article" | "case" | "problem";

export interface ContentComment {
  commentId: string;
  targetType: CommentTargetType;
  targetId: string;
  bodyMd: string;
  authorId: string | null;
  authorName: string | null;
  /** 작성자가 강사·원장인지. true = 전체 공개 메모, false = 작성자 본인 전용. */
  authorIsStaff: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const COMMENT_COLUMNS =
  "comment_id, target_type, target_id, body_md, author_id, is_pinned, created_at, updated_at, profiles!content_comments_author_id_fkey(name, role)";

type CommentRow = {
  comment_id: string;
  target_type: string;
  target_id: string;
  body_md: string;
  author_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  profiles: { name: string | null; role: string } | null;
};

function mapComment(r: CommentRow): ContentComment {
  return {
    commentId: r.comment_id,
    targetType: r.target_type as CommentTargetType,
    targetId: r.target_id,
    bodyMd: r.body_md,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    authorIsStaff:
      r.profiles?.role === "instructor" ||
      r.profiles?.role === "manager" ||
      r.profiles?.role === "admin",
    isPinned: r.is_pinned,
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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
    bodyMd: string;
    isPinned?: boolean;
  },
): Promise<{ ok: true; commentId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("content_comments")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      body_md: input.bodyMd,
      author_id: input.authorId,
      is_pinned: input.isPinned ?? false,
    })
    .select("comment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, commentId: data.comment_id };
}

export async function updateComment(
  client: SupabaseClient<Database>,
  commentId: string,
  patch: { bodyMd?: string; isPinned?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.bodyMd !== undefined) update.body_md = patch.bodyMd;
  if (patch.isPinned !== undefined) update.is_pinned = patch.isPinned;
  if (Object.keys(update).length === 0)
    return { ok: false, error: "변경할 내용 없음" };
  const { error } = await client
    .from("content_comments")
    .update(update)
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// soft delete — 수험생 작성 메모는 학습 데이터이므로 deleted_at 으로만 삭제 (CLAUDE.md #9).
export async function deleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("content_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

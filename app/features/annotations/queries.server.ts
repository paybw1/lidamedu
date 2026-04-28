import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type {
  AnnotationTargetType,
  BookmarkRecord,
  MemoRecord,
  HighlightColor,
  HighlightRecord,
} from "./labels";
export {
  ANNOTATION_TARGET_TYPES,
  annotationTargetTypeSchema,
  HIGHLIGHT_COLORS,
  highlightColorSchema,
} from "./labels";

import type {
  AnnotationTargetType,
  BookmarkRecord,
  MemoRecord,
  HighlightColor,
  HighlightRecord,
} from "./labels";

export async function getBookmark(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<BookmarkRecord | null> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("bookmark_id, star_level, note_md, updated_at")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    updatedAt: data.updated_at,
  };
}

export async function upsertBookmark(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  starLevel: number,
  noteMd: string | null,
): Promise<BookmarkRecord> {
  const { data, error } = await client
    .from("user_bookmarks")
    .upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        star_level: starLevel,
        note_md: noteMd,
        deleted_at: null,
      },
      { onConflict: "user_id,target_type,target_id" },
    )
    .select("bookmark_id, star_level, note_md, updated_at")
    .single();

  if (error) throw error;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    updatedAt: data.updated_at,
  };
}

export async function listMemos(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<MemoRecord[]> {
  const { data, error } = await client
    .from("user_memos")
    .select("memo_id, body_md, created_at, updated_at")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    memoId: row.memo_id,
    bodyMd: row.body_md,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createMemo(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  bodyMd: string,
): Promise<MemoRecord> {
  const { data, error } = await client
    .from("user_memos")
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      body_md: bodyMd,
    })
    .select("memo_id, body_md, created_at, updated_at")
    .single();

  if (error) throw error;
  return {
    memoId: data.memo_id,
    bodyMd: data.body_md,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

interface HighlightInput {
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  color: HighlightColor;
  label: string | null;
  excerpt: string;
}

export async function listHighlights(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<HighlightRecord[]> {
  const { data, error } = await client
    .from("user_highlights")
    .select(
      "highlight_id, field_path, start_offset, end_offset, content_hash, color, label, created_at",
    )
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    highlightId: row.highlight_id,
    fieldPath: row.field_path,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    contentHash: row.content_hash,
    color: row.color as HighlightColor,
    label: row.label,
    createdAt: row.created_at,
    // excerpt 는 label 에 캐시되거나 별도 컬럼이 없어 클라이언트에서 텍스트 선택 시 저장한 것을 활용.
    // 1차에서는 label 을 발췌 텍스트 보관소로 활용 (아래 createHighlight 참조)
    excerpt: row.label ?? "",
  }));
}

export async function createHighlight(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  input: HighlightInput,
): Promise<HighlightRecord> {
  // 발췌 텍스트는 label 컬럼에 저장 (별도 excerpt 컬럼은 향후 추가)
  const { data, error } = await client
    .from("user_highlights")
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      field_path: input.fieldPath,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      content_hash: input.contentHash,
      color: input.color,
      label: input.excerpt.slice(0, 500),
    })
    .select(
      "highlight_id, field_path, start_offset, end_offset, content_hash, color, label, created_at",
    )
    .single();

  if (error) throw error;
  return {
    highlightId: data.highlight_id,
    fieldPath: data.field_path,
    startOffset: data.start_offset,
    endOffset: data.end_offset,
    contentHash: data.content_hash,
    color: data.color as HighlightColor,
    label: data.label,
    createdAt: data.created_at,
    excerpt: data.label ?? "",
  };
}

export async function softDeleteHighlight(
  client: SupabaseClient<Database>,
  userId: string,
  highlightId: string,
): Promise<void> {
  const { error } = await client
    .from("user_highlights")
    .update({ deleted_at: new Date().toISOString() })
    .eq("highlight_id", highlightId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function softDeleteMemo(
  client: SupabaseClient<Database>,
  userId: string,
  memoId: string,
): Promise<void> {
  const { error } = await client
    .from("user_memos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("memo_id", memoId)
    .eq("user_id", userId);

  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type {
  AnnotationTargetType,
  BookmarkRecord,
  BookmarkStepNotes,
  MemoRecord,
  HighlightColor,
  HighlightRecord,
} from "./labels";
export {
  ANNOTATION_TARGET_TYPES,
  annotationTargetTypeSchema,
  BOOKMARK_STEP_LEVELS,
  HIGHLIGHT_COLORS,
  highlightColorSchema,
} from "./labels";

import type {
  AnnotationTargetType,
  BookmarkRecord,
  BookmarkStepNotes,
  MemoRecord,
  HighlightColor,
  HighlightRecord,
} from "./labels";

// JSONB → BookmarkStepNotes 안전 변환. 알 수 없는 키는 무시.
function parseStepNotes(value: unknown): BookmarkStepNotes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: BookmarkStepNotes = {};
  for (const key of ["1", "2", "3", "4", "5"] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  return out;
}

// 사용자의 article 타입 즐겨찾기 단계를 articleId → star_level 맵으로 반환.
// 트리 필터링용. (제거된 즐겨찾기 = deleted_at IS NULL 조건으로 제외)
export async function getUserArticleBookmarkLevels(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("target_id, star_level")
    .eq("user_id", userId)
    .eq("target_type", "article")
    .is("deleted_at", null);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.target_id] = row.star_level;
  }
  return out;
}

// 사용자의 article 단위 메모·하이라이트 카운트.
// 같은 article_id 에 대한 학습 활동을, 그 article 이 매핑된 모든 트리 노드(체계도/조문)에서
// 동일하게 표시하기 위한 데이터.
export interface ArticleAnnotationCounts {
  memos: number;
  highlights: number;
}

export async function getUserArticleAnnotationCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, ArticleAnnotationCounts>> {
  const [memos, highlights] = await Promise.all([
    client
      .from("user_memos")
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null),
    client
      .from("user_highlights")
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null),
  ]);
  if (memos.error) throw memos.error;
  if (highlights.error) throw highlights.error;

  const out: Record<string, ArticleAnnotationCounts> = {};
  for (const row of memos.data ?? []) {
    const cur = out[row.target_id] ?? { memos: 0, highlights: 0 };
    cur.memos += 1;
    out[row.target_id] = cur;
  }
  for (const row of highlights.data ?? []) {
    const cur = out[row.target_id] ?? { memos: 0, highlights: 0 };
    cur.highlights += 1;
    out[row.target_id] = cur;
  }
  return out;
}

// multi-article: 여러 article 의 bookmark / memos / highlights 를 한 번에 가져와 articleId map 으로 반환.
// 그룹 viewer (체계도 그룹 노드) 처럼 article 여러 개를 한 화면에 동시 표시할 때 사용.
export async function getBookmarksByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, BookmarkRecord>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("user_bookmarks")
    .select("bookmark_id, target_id, star_level, note_md, step_notes, updated_at")
    .eq("user_id", userId)
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null);
  if (error) throw error;
  const out: Record<string, BookmarkRecord> = {};
  for (const row of data ?? []) {
    out[row.target_id] = {
      bookmarkId: row.bookmark_id,
      starLevel: row.star_level,
      noteMd: row.note_md,
      stepNotes: parseStepNotes(row.step_notes),
      updatedAt: row.updated_at,
    };
  }
  return out;
}

export async function listMemosByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, MemoRecord[]>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("user_memos")
    .select("memo_id, target_id, body_md, created_at, updated_at")
    .eq("user_id", userId)
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, MemoRecord[]> = {};
  for (const row of data ?? []) {
    const list = out[row.target_id] ?? [];
    list.push({
      memoId: row.memo_id,
      bodyMd: row.body_md,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    out[row.target_id] = list;
  }
  return out;
}

export async function listHighlightsByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, HighlightRecord[]>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("user_highlights")
    .select(
      "highlight_id, target_id, field_path, start_offset, end_offset, content_hash, color, label, created_at",
    )
    .eq("user_id", userId)
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, HighlightRecord[]> = {};
  for (const row of data ?? []) {
    const list = out[row.target_id] ?? [];
    list.push({
      highlightId: row.highlight_id,
      fieldPath: row.field_path,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      contentHash: row.content_hash,
      color: row.color as HighlightColor,
      label: row.label,
      createdAt: row.created_at,
      excerpt: row.label ?? "",
    });
    out[row.target_id] = list;
  }
  return out;
}

export async function getBookmark(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<BookmarkRecord | null> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
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
    stepNotes: parseStepNotes(data.step_notes),
    updatedAt: data.updated_at,
  };
}

// 평점만 갱신. 단계별 메모는 건드리지 않는다.
export async function upsertBookmarkRating(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  starLevel: number,
): Promise<BookmarkRecord> {
  const { data, error } = await client
    .from("user_bookmarks")
    .upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        star_level: starLevel,
        deleted_at: null,
      },
      { onConflict: "user_id,target_type,target_id" },
    )
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
    .single();

  if (error) throw error;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    stepNotes: parseStepNotes(data.step_notes),
    updatedAt: data.updated_at,
  };
}

// 단계별 메모 한 칸 갱신/삭제. trim 후 비어있으면 해당 키 제거.
// 행이 없으면 starLevel = stepLevel 로 새로 만들어서 함께 저장.
export async function upsertBookmarkStepNote(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  stepLevel: number,
  stepNote: string | null,
): Promise<BookmarkRecord> {
  const existing = await getBookmark(client, userId, targetType, targetId);
  const next: BookmarkStepNotes = { ...(existing?.stepNotes ?? {}) };
  const key = String(stepLevel) as "1" | "2" | "3" | "4" | "5";
  if (stepNote && stepNote.trim().length > 0) {
    next[key] = stepNote;
  } else {
    delete next[key];
  }

  const starLevel = existing?.starLevel ?? stepLevel;

  const { data, error } = await client
    .from("user_bookmarks")
    .upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        star_level: starLevel,
        step_notes: next,
        deleted_at: null,
      },
      { onConflict: "user_id,target_type,target_id" },
    )
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
    .single();

  if (error) throw error;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    stepNotes: parseStepNotes(data.step_notes),
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

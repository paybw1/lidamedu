// 커뮤니티 게시판 서버 쿼리 — feat-6-002.
// 작성자명은 profiles RLS(본인 행만) 때문에 임베드 불가 → public_profiles 뷰를 batch 조회한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  CommunityBoard,
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  PostAuthor,
} from "./labels";

export type {
  CommunityBoard,
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  PostAuthor,
} from "./labels";

type MutationResult = { ok: true } | { ok: false; error: string };

/* ── 작성자 조회 ──────────────────────────────────────────────────────── */

async function fetchAuthors(
  client: SupabaseClient<Database>,
  ids: Array<string | null>,
): Promise<Map<string, PostAuthor>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const { data, error } = await client
    .from("public_profiles")
    .select("profile_id, name, role")
    .in("profile_id", unique);
  if (error) throw error;
  const map = new Map<string, PostAuthor>();
  for (const row of data ?? []) {
    if (!row.profile_id) continue;
    map.set(row.profile_id, {
      id: row.profile_id,
      name: row.name,
      role: row.role,
    });
  }
  return map;
}

function resolveAuthor(
  authorId: string | null,
  authors: Map<string, PostAuthor>,
): PostAuthor | null {
  if (!authorId) return null;
  return authors.get(authorId) ?? { id: authorId, name: null, role: null };
}

/* ── 게시글 조회 ──────────────────────────────────────────────────────── */

const POST_SUMMARY_COLUMNS =
  "post_id, board, title, author_id, is_pinned, closed_at, created_at, updated_at, community_post_comments(count)";
const POST_DETAIL_COLUMNS = `${POST_SUMMARY_COLUMNS}, body_md`;

type RawPostRow = {
  post_id: string;
  board: CommunityBoard;
  title: string;
  author_id: string | null;
  is_pinned: boolean;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  community_post_comments: { count: number }[];
};
type RawPostDetailRow = RawPostRow & { body_md: string };

function toSummary(row: RawPostRow, authors: Map<string, PostAuthor>): CommunityPostSummary {
  return {
    postId: row.post_id,
    board: row.board,
    title: row.title,
    author: resolveAuthor(row.author_id, authors),
    isPinned: row.is_pinned,
    closedAt: row.closed_at,
    commentCount: row.community_post_comments[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListPostsOptions {
  board: CommunityBoard;
  query?: string;
  limit?: number;
}

// 게시판 목록 — 고정글 상단, 최신순. RLS 가 가시성(deleted_at) 처리.
export async function listPosts(
  client: SupabaseClient<Database>,
  options: ListPostsOptions,
): Promise<CommunityPostSummary[]> {
  let q = client
    .from("community_posts")
    .select(POST_SUMMARY_COLUMNS)
    .eq("board", options.board)
    .is("deleted_at", null);

  if (options.query && options.query.trim().length > 0) {
    const term = options.query.trim().replace(/[,()]/g, " ");
    q = q.or(`title.ilike.%${term}%,body_md.ilike.%${term}%`);
  }

  q = q
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data as unknown as RawPostRow[] | null) ?? [];
  const authors = await fetchAuthors(
    client,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => toSummary(r, authors));
}

export async function getPost(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<CommunityPostDetail | null> {
  const { data, error } = await client
    .from("community_posts")
    .select(POST_DETAIL_COLUMNS)
    .eq("post_id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as RawPostDetailRow;
  const authors = await fetchAuthors(client, [row.author_id]);
  return { ...toSummary(row, authors), bodyMd: row.body_md };
}

/* ── 댓글 조회 ────────────────────────────────────────────────────────── */

type RawCommentRow = {
  comment_id: string;
  post_id: string;
  body_md: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listComments(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<CommunityComment[]> {
  const { data, error } = await client
    .from("community_post_comments")
    .select("comment_id, post_id, body_md, author_id, created_at, updated_at")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data as unknown as RawCommentRow[] | null) ?? [];
  const authors = await fetchAuthors(
    client,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => ({
    commentId: r.comment_id,
    postId: r.post_id,
    bodyMd: r.body_md,
    author: resolveAuthor(r.author_id, authors),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/* ── 게시글 변경 ──────────────────────────────────────────────────────── */

export async function createPost(
  client: SupabaseClient<Database>,
  authorId: string,
  input: { board: CommunityBoard; title: string; bodyMd: string },
): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("community_posts")
    .insert({
      board: input.board,
      author_id: authorId,
      title: input.title,
      body_md: input.bodyMd,
    })
    .select("post_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, postId: data.post_id };
}

// 본문 수정 — 권한(작성자/운영자)은 호출부 + RLS 가 강제. 영향 행 0이면 실패.
export async function updatePost(
  client: SupabaseClient<Database>,
  postId: string,
  patch: { title: string; bodyMd: string },
): Promise<MutationResult> {
  const { data, error } = await client
    .from("community_posts")
    .update({ title: patch.title, body_md: patch.bodyMd })
    .eq("post_id", postId)
    .is("deleted_at", null)
    .select("post_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

export async function softDeletePost(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<MutationResult> {
  const { data, error } = await client
    .from("community_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("post_id", postId)
    .is("deleted_at", null)
    .select("post_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

// is_pinned 변경 — community_posts_guard_pin 트리거가 manager 아니면 예외.
export async function setPostPinned(
  client: SupabaseClient<Database>,
  postId: string,
  isPinned: boolean,
): Promise<MutationResult> {
  const { data, error } = await client
    .from("community_posts")
    .update({ is_pinned: isPinned })
    .eq("post_id", postId)
    .is("deleted_at", null)
    .select("post_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

// study 게시판 모집 마감/재개.
export async function setPostClosed(
  client: SupabaseClient<Database>,
  postId: string,
  closed: boolean,
): Promise<MutationResult> {
  const { data, error } = await client
    .from("community_posts")
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq("post_id", postId)
    .is("deleted_at", null)
    .select("post_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

/* ── 댓글 변경 ────────────────────────────────────────────────────────── */

export async function createComment(
  client: SupabaseClient<Database>,
  authorId: string,
  input: { postId: string; bodyMd: string },
): Promise<{ ok: true; commentId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("community_post_comments")
    .insert({
      post_id: input.postId,
      author_id: authorId,
      body_md: input.bodyMd,
    })
    .select("comment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, commentId: data.comment_id };
}

export async function softDeleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
): Promise<MutationResult> {
  const { data, error } = await client
    .from("community_post_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("comment_id", commentId)
    .is("deleted_at", null)
    .select("comment_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

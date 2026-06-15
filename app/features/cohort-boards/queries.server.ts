// feat-6-010 반별 게시판 — 게시판(운영자) 관리 쿼리.
// 변이(create/update/soft-delete·접근 반 연결)는 RLS 적용 client 로 수행 → DB 레벨 강제(화면 가드 비의존).
// 목록 표시(반 이름·글 수)는 cross-RLS 라 adminClient(loader 가 staff 가드 선행).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import type { StaffRole } from "~/features/laws/queries.server";

import type {
  BoardAuthor,
  CohortBoardAttachment,
  CohortBoardComment,
  CohortBoardEdit,
  CohortBoardListItem,
  CohortBoardPostDetail,
  CohortBoardPostSummary,
  CohortBoardWriteScope,
  MutationResult,
} from "./labels";

const admin = adminClient as SupabaseClient<Database>;

// 운영자(staff)가 관리하는 게시판 목록. manager=전체 / instructor=본인 생성 OR 담당 반 연결.
export async function listBoardsForStaff(
  role: StaffRole,
  userId: string,
): Promise<CohortBoardListItem[]> {
  let boardIds: string[];
  if (roleAtLeast(role, "manager")) {
    const { data } = await admin
      .from("cohort_boards")
      .select("board_id")
      .is("deleted_at", null);
    boardIds = (data ?? []).map((b) => b.board_id);
  } else {
    const { data: owned } = await admin
      .from("cohorts")
      .select("cohort_id")
      .eq("owner_id", userId)
      .is("deleted_at", null);
    const ownedIds = (owned ?? []).map((c) => c.cohort_id);
    const linkedRes = ownedIds.length
      ? await admin
          .from("cohort_board_cohorts")
          .select("board_id")
          .in("cohort_id", ownedIds)
      : { data: [] as { board_id: string }[] };
    const { data: created } = await admin
      .from("cohort_boards")
      .select("board_id")
      .eq("created_by", userId)
      .is("deleted_at", null);
    boardIds = [
      ...new Set([
        ...(linkedRes.data ?? []).map((l) => l.board_id),
        ...(created ?? []).map((c) => c.board_id),
      ]),
    ];
  }
  if (boardIds.length === 0) return [];

  const [boardsRes, linksRes, postsRes] = await Promise.all([
    admin
      .from("cohort_boards")
      .select("board_id, title, description, write_scope, created_at")
      .in("board_id", boardIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("cohort_board_cohorts")
      .select("board_id, cohort_id, cohorts(name)")
      .in("board_id", boardIds),
    admin
      .from("cohort_board_posts")
      .select("board_id")
      .in("board_id", boardIds)
      .is("deleted_at", null),
  ]);

  const cohortsByBoard = new Map<string, { cohortId: string; name: string }[]>();
  for (const l of linksRes.data ?? []) {
    const arr = cohortsByBoard.get(l.board_id) ?? [];
    arr.push({ cohortId: l.cohort_id, name: l.cohorts?.name ?? "(삭제된 반)" });
    cohortsByBoard.set(l.board_id, arr);
  }
  const postCountByBoard = new Map<string, number>();
  for (const p of postsRes.data ?? [])
    postCountByBoard.set(p.board_id, (postCountByBoard.get(p.board_id) ?? 0) + 1);

  return (boardsRes.data ?? []).map((b) => ({
    boardId: b.board_id,
    title: b.title,
    description: b.description,
    writeScope: b.write_scope,
    cohorts: cohortsByBoard.get(b.board_id) ?? [],
    postCount: postCountByBoard.get(b.board_id) ?? 0,
    createdAt: b.created_at,
  }));
}

// 수정 폼 prefill — 관리 권한(manager/생성자/담당강사)자만.
export async function getBoardForEdit(
  role: StaffRole,
  userId: string,
  boardId: string,
): Promise<CohortBoardEdit | null> {
  const { data: b } = await admin
    .from("cohort_boards")
    .select("board_id, title, description, write_scope, created_by")
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!b) return null;
  const { data: links } = await admin
    .from("cohort_board_cohorts")
    .select("cohort_id, cohorts(owner_id)")
    .eq("board_id", boardId);
  const cohortIds = (links ?? []).map((l) => l.cohort_id);
  const manages =
    roleAtLeast(role, "manager") ||
    b.created_by === userId ||
    (links ?? []).some((l) => l.cohorts?.owner_id === userId);
  if (!manages) return null;
  return {
    boardId: b.board_id,
    title: b.title,
    description: b.description,
    writeScope: b.write_scope,
    cohortIds,
  };
}

// instructor 가 지정하려는 cohortIds 가 전부 본인 소유인지(친절 에러용 사전검사 — 실제 차단은 RLS).
async function cohortsAllOwned(userId: string, cohortIds: string[]): Promise<boolean> {
  if (cohortIds.length === 0) return true;
  const { data } = await admin
    .from("cohorts")
    .select("cohort_id")
    .in("cohort_id", cohortIds)
    .eq("owner_id", userId)
    .is("deleted_at", null);
  return (data ?? []).length === cohortIds.length;
}

interface BoardInput {
  title: string;
  description: string | null;
  writeScope: CohortBoardWriteScope;
  cohortIds: string[];
}

// 생성 — RLS client. 보드 insert(created_by=본인) → 접근 반 링크 insert. 링크 실패 시 보드 정리.
export async function createBoard(
  client: SupabaseClient<Database>,
  role: StaffRole,
  userId: string,
  input: BoardInput,
): Promise<MutationResult> {
  if (input.cohortIds.length === 0)
    return { ok: false, error: "접근 반을 한 개 이상 선택하세요." };
  if (!roleAtLeast(role, "manager") && !(await cohortsAllOwned(userId, input.cohortIds)))
    return { ok: false, error: "본인이 담당하는 반만 지정할 수 있습니다." };

  const { data: board, error } = await client
    .from("cohort_boards")
    .insert({
      title: input.title,
      description: input.description,
      write_scope: input.writeScope,
      created_by: userId,
    })
    .select("board_id")
    .single();
  if (error || !board) return { ok: false, error: error?.message ?? "게시판 생성 실패" };

  const { error: linkErr } = await client.from("cohort_board_cohorts").insert(
    input.cohortIds.map((cohortId) => ({
      board_id: board.board_id,
      cohort_id: cohortId,
      added_by: userId,
    })),
  );
  if (linkErr) {
    await client.rpc("soft_delete_cohort_board", { p_board_id: board.board_id });
    return { ok: false, error: `접근 반 연결 실패: ${linkErr.message}` };
  }
  return { ok: true };
}

// 수정 — RLS client. 보드 update + 링크 delete-all → re-insert.
export async function updateBoard(
  client: SupabaseClient<Database>,
  role: StaffRole,
  userId: string,
  boardId: string,
  input: BoardInput,
): Promise<MutationResult> {
  if (input.cohortIds.length === 0)
    return { ok: false, error: "접근 반을 한 개 이상 선택하세요." };
  if (!roleAtLeast(role, "manager") && !(await cohortsAllOwned(userId, input.cohortIds)))
    return { ok: false, error: "본인이 담당하는 반만 지정할 수 있습니다." };

  const { error, count } = await client
    .from("cohort_boards")
    .update(
      {
        title: input.title,
        description: input.description,
        write_scope: input.writeScope,
      },
      { count: "exact" },
    )
    .eq("board_id", boardId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "수정 권한이 없거나 게시판이 없습니다." };

  await client.from("cohort_board_cohorts").delete().eq("board_id", boardId);
  const { error: linkErr } = await client.from("cohort_board_cohorts").insert(
    input.cohortIds.map((cohortId) => ({
      board_id: boardId,
      cohort_id: cohortId,
      added_by: userId,
    })),
  );
  if (linkErr) return { ok: false, error: `접근 반 갱신 실패: ${linkErr.message}` };
  return { ok: true };
}

// soft-delete — RLS-enforced RPC (작성자/담당강사/manager 만).
export async function softDeleteBoard(
  client: SupabaseClient<Database>,
  boardId: string,
): Promise<MutationResult> {
  const { error } = await client.rpc("soft_delete_cohort_board", {
    p_board_id: boardId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 학생·강사 게시판 — 글/댓글. 조회·쓰기 모두 RLS client 로 DB 강제(adminClient 미사용).
// 권한 판정은 RLS 와 동일한 SECURITY DEFINER 헬퍼를 RPC 로 호출 = 버튼 노출 단일 진실원.
// ─────────────────────────────────────────────────────────────────────────────

const BOARD_POST_PAGE_SIZE = 20;

// 작성자 이름 — profiles RLS 는 본인 row 만 노출하므로 public_profiles 뷰로 배치 조회(community 패턴).
async function fetchBoardAuthors(
  client: SupabaseClient<Database>,
  ids: Array<string | null>,
): Promise<Map<string, BoardAuthor>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const { data } = await client
    .from("public_profiles")
    .select("profile_id, name, role")
    .in("profile_id", unique);
  const map = new Map<string, BoardAuthor>();
  for (const row of data ?? []) {
    if (!row.profile_id) continue;
    map.set(row.profile_id, {
      profileId: row.profile_id,
      name: row.name,
      role: row.role,
    });
  }
  return map;
}

export interface AccessibleBoard {
  boardId: string;
  title: string;
  description: string | null;
  writeScope: CohortBoardWriteScope;
  postCount: number;
}

// 학생/강사 진입 — RLS(cohort_boards_read)가 소속 반 연결 OR 생성자 게시판만 반환 → "소속 반 게시판 합집합".
export async function listAccessibleBoards(
  client: SupabaseClient<Database>,
): Promise<AccessibleBoard[]> {
  const { data, error } = await client
    .from("cohort_boards")
    .select(
      "board_id, title, description, write_scope, cohort_board_posts(count)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({
    boardId: b.board_id,
    title: b.title,
    description: b.description,
    writeScope: b.write_scope,
    postCount: b.cohort_board_posts?.[0]?.count ?? 0,
  }));
}

export interface BoardMeta {
  boardId: string;
  title: string;
  description: string | null;
  writeScope: CohortBoardWriteScope;
}

// 게시판 헤더 — RLS 가 접근권 없는 board 는 null 반환(→ 404).
export async function getBoardMeta(
  client: SupabaseClient<Database>,
  boardId: string,
): Promise<BoardMeta | null> {
  const { data } = await client
    .from("cohort_boards")
    .select("board_id, title, description, write_scope")
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    boardId: data.board_id,
    title: data.title,
    description: data.description,
    writeScope: data.write_scope,
  };
}

export interface ListBoardPostsResult {
  items: CohortBoardPostSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBoardPosts(
  client: SupabaseClient<Database>,
  boardId: string,
  opts: { page?: number } = {},
): Promise<ListBoardPostsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * BOARD_POST_PAGE_SIZE;
  const to = from + BOARD_POST_PAGE_SIZE - 1;
  const { data, error, count } = await client
    .from("cohort_board_posts")
    .select(
      "post_id, board_id, title, author_id, is_pinned, created_at, cohort_board_comments(count)",
      { count: "exact" },
    )
    .eq("board_id", boardId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = data ?? [];
  const authors = await fetchBoardAuthors(
    client,
    rows.map((r) => r.author_id),
  );
  const items: CohortBoardPostSummary[] = rows.map((r) => ({
    postId: r.post_id,
    boardId: r.board_id,
    title: r.title,
    author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
    isPinned: r.is_pinned,
    commentCount: r.cohort_board_comments?.[0]?.count ?? 0,
    createdAt: r.created_at,
  }));
  return { items, total: count ?? 0, page, pageSize: BOARD_POST_PAGE_SIZE };
}

export async function getBoardPost(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<CohortBoardPostDetail | null> {
  const { data } = await client
    .from("cohort_board_posts")
    .select(
      "post_id, board_id, title, body_md, author_id, is_pinned, created_at",
    )
    .eq("post_id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const authors = await fetchBoardAuthors(client, [data.author_id]);
  return {
    postId: data.post_id,
    boardId: data.board_id,
    title: data.title,
    bodyMd: data.body_md,
    author: data.author_id ? (authors.get(data.author_id) ?? null) : null,
    isPinned: data.is_pinned,
    commentCount: 0,
    createdAt: data.created_at,
  };
}

export async function listBoardComments(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<CohortBoardComment[]> {
  const { data, error } = await client
    .from("cohort_board_comments")
    .select("comment_id, post_id, body_md, author_id, created_at")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authors = await fetchBoardAuthors(
    client,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => ({
    commentId: r.comment_id,
    postId: r.post_id,
    bodyMd: r.body_md,
    author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
    createdAt: r.created_at,
  }));
}

// 권한 probe — RLS 헬퍼와 동일 함수(단일 진실원). 버튼 노출용, 실차단은 RLS/RPC.
export async function canWriteBoard(
  client: SupabaseClient<Database>,
  boardId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client.rpc("user_can_write_cohort_board", {
    p_board_id: boardId,
    p_user_id: userId,
  });
  return data === true;
}

export async function managesBoard(
  client: SupabaseClient<Database>,
  boardId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client.rpc("user_manages_cohort_board", {
    p_board_id: boardId,
    p_user_id: userId,
  });
  return data === true;
}

export async function createBoardPost(
  client: SupabaseClient<Database>,
  authorId: string,
  input: { boardId: string; title: string; bodyMd: string },
): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("cohort_board_posts")
    .insert({
      board_id: input.boardId,
      author_id: authorId,
      title: input.title,
      body_md: input.bodyMd,
    })
    .select("post_id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "글 작성에 실패했습니다." };
  return { ok: true, postId: data.post_id };
}

export async function updateBoardPost(
  client: SupabaseClient<Database>,
  postId: string,
  patch: { title: string; bodyMd: string },
): Promise<MutationResult> {
  const { error, count } = await client
    .from("cohort_board_posts")
    .update({ title: patch.title, body_md: patch.bodyMd }, { count: "exact" })
    .eq("post_id", postId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "수정 권한이 없거나 글이 없습니다." };
  return { ok: true };
}

export async function softDeleteBoardPost(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<MutationResult> {
  const { error } = await client.rpc("soft_delete_cohort_board_post", {
    p_post_id: postId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createBoardComment(
  client: SupabaseClient<Database>,
  authorId: string,
  input: { postId: string; bodyMd: string },
): Promise<{ ok: true; commentId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("cohort_board_comments")
    .insert({
      post_id: input.postId,
      author_id: authorId,
      body_md: input.bodyMd,
    })
    .select("comment_id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "댓글 작성에 실패했습니다." };
  return { ok: true, commentId: data.comment_id };
}

export async function softDeleteBoardComment(
  client: SupabaseClient<Database>,
  commentId: string,
): Promise<MutationResult> {
  const { error } = await client.rpc("soft_delete_cohort_board_comment", {
    p_comment_id: commentId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── ③b 첨부 + 고정(pin) ──────────────────────────────────────────────────────

// 첨부 목록(RLS cbpa_read = 글 읽기권). storage path 는 반환하지 않음(노출 금지).
export async function listBoardAttachments(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<CohortBoardAttachment[]> {
  const { data, error } = await client
    .from("cohort_board_post_attachments")
    .select("attachment_id, post_id, kind, original_filename, size_bytes, mime, sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((a) => ({
    attachmentId: a.attachment_id,
    postId: a.post_id,
    kind: a.kind,
    originalFilename: a.original_filename,
    sizeBytes: a.size_bytes,
    mime: a.mime,
    sortOrder: a.sort_order,
  }));
}

// 첨부 권한 probe(=cbpa_insert/delete 와 동일 함수). 업로드 버튼 노출·사전 가드용.
export async function canAttachPost(
  client: SupabaseClient<Database>,
  postId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client.rpc("user_can_attach_cohort_post", {
    p_post_id: postId,
    p_user_id: userId,
  });
  return data === true;
}

// 고정 토글 — manager 전용 RPC(+ 가드 트리거). 비관리자는 42501.
export async function setBoardPostPinned(
  client: SupabaseClient<Database>,
  postId: string,
  pinned: boolean,
): Promise<MutationResult> {
  const { error } = await client.rpc("set_cohort_board_post_pinned", {
    p_post_id: postId,
    p_pinned: pinned,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

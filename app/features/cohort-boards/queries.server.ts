// feat-6-010 반별 게시판 — 게시판(운영자) 관리 쿼리.
// 변이(create/update/soft-delete·접근 반 연결)는 RLS 적용 client 로 수행 → DB 레벨 강제(화면 가드 비의존).
// 목록 표시(반 이름·글 수)는 cross-RLS 라 adminClient(loader 가 staff 가드 선행).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import type { StaffRole } from "~/features/laws/queries.server";

import type {
  CohortBoardEdit,
  CohortBoardListItem,
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

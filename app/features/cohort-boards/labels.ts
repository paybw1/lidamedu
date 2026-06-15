// feat-6-010 반별 게시판 — 공용 타입/라벨/zod.
import type { Database } from "database.types";
import { z } from "zod";

export type CohortBoardWriteScope =
  Database["public"]["Enums"]["cohort_board_write_scope"]; // 'staff' | 'members'

export const COHORT_BOARD_WRITE_SCOPES: CohortBoardWriteScope[] = [
  "staff",
  "members",
];
export const writeScopeSchema = z.enum(["staff", "members"]);

// 공지형 = 강사/매니저만 작성 / 소통형 = 소속 학생도 작성.
export const WRITE_SCOPE_LABEL: Record<CohortBoardWriteScope, string> = {
  staff: "공지형 (강사만 작성)",
  members: "소통형 (학생도 작성)",
};
export const WRITE_SCOPE_SHORT: Record<CohortBoardWriteScope, string> = {
  staff: "공지형",
  members: "소통형",
};

export interface BoardAuthor {
  profileId: string;
  name: string | null;
  role: string | null;
}

export interface CohortBoardListItem {
  boardId: string;
  title: string;
  description: string | null;
  writeScope: CohortBoardWriteScope;
  cohorts: { cohortId: string; name: string }[];
  postCount: number;
  createdAt: string;
}

export interface CohortBoardEdit {
  boardId: string;
  title: string;
  description: string | null;
  writeScope: CohortBoardWriteScope;
  cohortIds: string[];
}

// 게시판 글/댓글 (③ 화면용)
export interface CohortBoardPostSummary {
  postId: string;
  boardId: string;
  title: string;
  author: BoardAuthor | null;
  isPinned: boolean;
  commentCount: number;
  createdAt: string;
}
export interface CohortBoardPostDetail extends CohortBoardPostSummary {
  bodyMd: string;
}
export interface CohortBoardComment {
  commentId: string;
  postId: string;
  bodyMd: string;
  author: BoardAuthor | null;
  createdAt: string;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

// 커뮤니티 게시판 공용 타입 · 라벨 · zod 스키마 — feat-6-002.
// 아이콘 등 표시 자원은 board-icon.tsx 가 소유한다 (이 파일은 서버에서도 value import 안전).
import type { Database } from "database.types";
import { z } from "zod";

import type { UserRole } from "~/core/lib/roles";

export type CommunityBoard = Database["public"]["Enums"]["community_board"];

/** 게시판 노출 순서. */
export const COMMUNITY_BOARDS: CommunityBoard[] = ["free", "study", "review"];

export const communityBoardSchema = z.enum(["free", "study", "review"]);

export const BOARD_LABEL: Record<CommunityBoard, string> = {
  free: "자유게시판",
  study: "스터디 모집",
  review: "합격 후기",
};

export const BOARD_DESC: Record<CommunityBoard, string> = {
  free: "수험 정보와 일상을 나누는 공간",
  study: "함께 공부할 스터디원을 찾는 공간",
  review: "합격자의 학습 전략과 경험담",
};

/** 작성자 표시 정보 — public_profiles 뷰 경유. id 만 있고 이름이 없으면 탈퇴/조회 실패. */
export interface PostAuthor {
  id: string;
  name: string | null;
  role: UserRole | null;
}

export interface CommunityPostSummary {
  postId: string;
  board: CommunityBoard;
  title: string;
  author: PostAuthor | null;
  isPinned: boolean;
  /** study 게시판 모집 마감 시각. null = 모집 중 / 비대상 게시판. */
  closedAt: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPostDetail extends CommunityPostSummary {
  bodyMd: string;
}

export interface CommunityComment {
  commentId: string;
  postId: string;
  bodyMd: string;
  author: PostAuthor | null;
  createdAt: string;
  updatedAt: string;
}

// 커뮤니티 게시판 아이콘 — 허브·상세·색인 화면이 공유. feat-6-002.
import {
  GraduationCapIcon,
  MessageSquareTextIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import type { CommunityBoard } from "../labels";

export const BOARD_ICON: Record<
  CommunityBoard,
  ComponentType<{ className?: string }>
> = {
  free: MessageSquareTextIcon,
  study: UsersIcon,
  review: GraduationCapIcon,
};

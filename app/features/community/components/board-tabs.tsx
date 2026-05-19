// 커뮤니티 게시판 3종 서브 네비 — feat-6-002.
// CommunityShell category="community" 아래 2차 세그먼트 컨트롤.
import {
  GraduationCapIcon,
  MessageSquareTextIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

import { BOARD_LABEL, COMMUNITY_BOARDS, type CommunityBoard } from "../labels";

// 게시판 아이콘 — 허브·상세 화면이 공유.
export const BOARD_ICON: Record<
  CommunityBoard,
  ComponentType<{ className?: string }>
> = {
  free: MessageSquareTextIcon,
  study: UsersIcon,
  review: GraduationCapIcon,
};

export function BoardTabs({ active }: { active: CommunityBoard }) {
  return (
    <nav
      aria-label="커뮤니티 게시판"
      className="border-border bg-muted/50 mb-[18px] flex w-max max-w-full gap-1 overflow-x-auto rounded-full border p-1"
    >
      {COMMUNITY_BOARDS.map((board) => {
        const Icon = BOARD_ICON[board];
        const isActive = board === active;
        return (
          <Link
            key={board}
            to={`/community/${board}`}
            viewTransition
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] whitespace-nowrap transition-colors",
              isActive
                ? "bg-background text-primary font-bold shadow-sm"
                : "text-foreground/70 hover:text-foreground font-medium",
            )}
          >
            <Icon className="size-3.5" />
            <span>{BOARD_LABEL[board]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

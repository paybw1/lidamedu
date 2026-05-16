// 커뮤니티 영역 공통 셸 — 헤더(eyebrow·제목·설명) + 4 카테고리 탭 strip.
// 키트 lidam-community/Shell.jsx 디자인. community-redesign-brief §5.
// 온라인 GS · 커뮤니티 · Q&A · 공지사항 13개 화면이 공유한다.

import {
  MegaphoneIcon,
  MessageCircleQuestionIcon,
  PencilLineIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

export type CommunityCategory = "gs" | "community" | "qna" | "announce";

interface CategoryDef {
  id: CommunityCategory;
  to: string;
  label: string;
  /** 카테고리 색 dot — Tailwind 배경 클래스. */
  dotClass: string;
  Icon: ComponentType<{ className?: string }>;
}

// 4 카테고리 — community-redesign-brief §4.3.
const CATEGORIES: CategoryDef[] = [
  {
    id: "gs",
    to: "/gs",
    label: "온라인 GS",
    dotClass: "bg-primary",
    Icon: PencilLineIcon,
  },
  {
    id: "community",
    to: "/community",
    label: "커뮤니티",
    dotClass: "bg-violet-500",
    Icon: UsersIcon,
  },
  {
    id: "qna",
    to: "/qna",
    label: "Q&A",
    dotClass: "bg-amber-500",
    Icon: MessageCircleQuestionIcon,
  },
  {
    id: "announce",
    to: "/announcements",
    label: "공지사항",
    dotClass: "bg-emerald-500",
    Icon: MegaphoneIcon,
  },
];

// 4 카테고리 탭 strip — 형제 영역 단절 해소 (brief §5.2).
function CommunityTabs({ active }: { active: CommunityCategory }) {
  return (
    <nav
      aria-label="커뮤니티"
      className="border-border bg-muted/50 flex w-max max-w-full gap-1 overflow-x-auto rounded-full border p-1"
    >
      {CATEGORIES.map((c) => {
        const isActive = c.id === active;
        return (
          <Link
            key={c.id}
            to={c.to}
            viewTransition
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] whitespace-nowrap transition-colors",
              isActive
                ? "bg-background text-primary font-bold shadow-sm"
                : "text-foreground/70 hover:text-foreground font-medium",
            )}
          >
            <span aria-hidden className={cn("size-2 rounded-full", c.dotClass)} />
            <span>{c.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// 페이지 폭 — 허브·피드(중간) / 시험지(독서 폭) / 매트릭스(넓게).
const WIDTH_CLASS: Record<"feed" | "narrow" | "wide", string> = {
  feed: "max-w-5xl",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
};

// 커뮤니티 13개 화면 공통 셸.
export function CommunityShell({
  category,
  title,
  desc,
  headerRight,
  backLink,
  width = "feed",
  children,
}: {
  category: CommunityCategory;
  title: ReactNode;
  desc?: ReactNode;
  /** 헤더 우측 슬롯 (액션 버튼 등). */
  headerRight?: ReactNode;
  /** GS·Q&A 하위 화면의 부모 복귀 링크. */
  backLink?: { to: string; label: string };
  width?: "feed" | "narrow" | "wide";
  children: ReactNode;
}) {
  const Icon = (CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0])
    .Icon;
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 py-7 md:px-8 md:py-9",
        WIDTH_CLASS[width],
      )}
    >
      {backLink ? (
        <Link
          to={backLink.to}
          className="text-primary mb-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          <span aria-hidden>←</span>
          {backLink.label}
        </Link>
      ) : null}
      <header className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            <Icon className="size-3" />
            COMMUNITY · 커뮤니티
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight">
            {title}
          </h1>
          {desc ? (
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {desc}
            </p>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </header>
      <div className="mb-[18px]">
        <CommunityTabs active={category} />
      </div>
      {children}
    </div>
  );
}

// 모의고사 영역 공통 셸 — 헤더(eyebrow·제목·설명) + 본문.
// 영역 토글(탭)은 화면을 감싼 sticky AreaTabs 가 담당(여기서 중복 렌더하지 않음):
//   · /gs·통합 모의 색인 등은 mock.layout 이, /latest/mcq 모의 분기는 McqAreaShell 이 얹는다.
// (CATEGORIES 는 헤더 eyebrow 아이콘 룩업에 계속 사용.)

import {
  ClipboardListIcon,
  LayersIcon,
  PencilLineIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

export type MockExamCategory = "full" | "progressive" | "gs";

interface CategoryDef {
  id: MockExamCategory;
  to: string;
  label: string;
  /** 카테고리 색 dot — Tailwind 배경 클래스. */
  dotClass: string;
  Icon: ComponentType<{ className?: string }>;
}

// 3 카테고리 — 모의고사 상단 메뉴와 동일 구성.
const CATEGORIES: CategoryDef[] = [
  {
    id: "full",
    to: "/latest/mcq/exams",
    label: "1차 전체 모의고사",
    dotClass: "bg-primary",
    Icon: LayersIcon,
  },
  {
    id: "progressive",
    to: "/latest/mcq?kind=mock_progressive",
    label: "1차 진도별 모의고사",
    dotClass: "bg-amber-500",
    Icon: ClipboardListIcon,
  },
  {
    id: "gs",
    to: "/gs",
    label: "2차 모의고사",
    dotClass: "bg-violet-500",
    Icon: PencilLineIcon,
  },
];

// 페이지 폭 — 색인(넓게) / 피드(중간) / 시험지(독서 폭) / 매트릭스(최대).
const WIDTH_CLASS: Record<"index" | "feed" | "narrow" | "wide", string> = {
  index: "max-w-screen-xl",
  feed: "max-w-5xl",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
};

// 모의고사 영역 공통 셸.
export function MockExamShell({
  category,
  title,
  desc,
  headerRight,
  backLink,
  width = "feed",
  children,
}: {
  category: MockExamCategory;
  title: ReactNode;
  desc?: ReactNode;
  /** 헤더 우측 슬롯 (액션 버튼 등). */
  headerRight?: ReactNode;
  /** 하위 화면(상세·시험지·결과)의 부모 복귀 링크. */
  backLink?: { to: string; label: string };
  width?: "index" | "feed" | "narrow" | "wide";
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
            MOCK EXAM · 모의고사
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
      {children}
    </div>
  );
}

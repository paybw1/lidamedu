// 학습정보 9개 화면 공통 셸 — 헤더(eyebrow·제목·설명) + 6 카테고리 탭 strip.
// 키트 lidam-latest/Shell.jsx 디자인. brief §5.1~5.3.

import {
  BookIcon,
  FileTextIcon,
  GavelIcon,
  ListChecksIcon,
  PenLineIcon,
  ScaleIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import { SectionTabs } from "~/core/components/student";

// 6 카테고리 — 랜딩 LatestSection 과 색 계열 일관 (brief §4.3).
export type LatestCategory =
  | "laws"
  | "cases"
  | "mcq"
  | "essay"
  | "papers"
  | "books";

interface CategoryDef {
  id: LatestCategory;
  to: string;
  label: string;
  /** 카테고리 색 dot — Tailwind 배경 클래스. */
  dotClass: string;
  Icon: ComponentType<{ className?: string }>;
}

// 탭 순서 고정 — brief §5.2.
const CATEGORIES: CategoryDef[] = [
  {
    id: "laws",
    to: "/latest/laws",
    label: "법 개정",
    dotClass: "bg-emerald-500",
    Icon: ScaleIcon,
  },
  {
    id: "cases",
    to: "/latest/cases",
    label: "최근 판례",
    dotClass: "bg-violet-500",
    Icon: GavelIcon,
  },
  {
    id: "mcq",
    to: "/latest/mcq?kind=past_exam",
    label: "1차 기출문제",
    dotClass: "bg-amber-500",
    Icon: ListChecksIcon,
  },
  {
    id: "essay",
    to: "/latest/essay",
    label: "2차 기출문제",
    dotClass: "bg-rose-500",
    Icon: PenLineIcon,
  },
  {
    id: "papers",
    to: "/latest/papers",
    label: "논문",
    dotClass: "bg-sky-500",
    Icon: FileTextIcon,
  },
  {
    id: "books",
    to: "/latest/book-updates",
    label: "추록·정오표",
    dotClass: "bg-[#8B5A2B]",
    Icon: BookIcon,
  },
];

// 학습정보 탭 — 공용 `SectionTabs` 프리미티브 사용.
// 학습관리/지원 3 영역과 동일 디자인 톤. 카테고리 dot 색은 SectionTabs 의 dotClass prop 으로.
// `active` 인자는 호환성 유지 (SectionTabs 가 path 기반 자동 매칭).
function LatestTabs({ active: _active }: { active: LatestCategory }) {
  return (
    <SectionTabs
      ariaLabel="학습정보"
      sticky={false}
      items={CATEGORIES.map((c) => ({
        id: c.id,
        to: c.to,
        label: c.label,
        dotClass: c.dotClass,
        // mcq 는 ?kind=past_exam 쿼리가 to 에 들어 있어 path 매칭이 안 됨 — 명시 match.
        match: c.id === "mcq" ? ["/latest/mcq"] : [c.to],
      }))}
    />
  );
}

// 페이지 폭 — 색인 테이블(넓게) / 피드 카드(중간) / 시험지(독서 폭).
const WIDTH_CLASS: Record<"index" | "feed" | "narrow", string> = {
  index: "max-w-screen-xl",
  feed: "max-w-5xl",
  narrow: "max-w-3xl",
};

// 학습정보 9개 화면 공통 셸.
export function LatestShell({
  category,
  title,
  desc,
  headerRight,
  backLink,
  width = "feed",
  children,
}: {
  category: LatestCategory;
  title: ReactNode;
  desc: ReactNode;
  /** 운영자 추가 버튼 등 헤더 우측 슬롯. */
  headerRight?: ReactNode;
  /** MCQ 하위 화면(상세·시험지·결과)의 색인 복귀 링크. */
  backLink?: { to: string; label: string };
  width?: "index" | "feed" | "narrow";
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
            LATEST · 학습정보
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {desc}
          </p>
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </header>
      <div className="mb-[18px]">
        <LatestTabs active={category} />
      </div>
      {children}
    </div>
  );
}

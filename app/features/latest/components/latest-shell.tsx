// 학습정보 9개 화면 공통 셸 — 헤더(eyebrow·제목·설명) + 6 카테고리 탭 strip.
// 키트 lidam-latest/Shell.jsx 디자인. brief §5.1~5.3.
import type { ReactNode } from "react";

import { Link } from "react-router";

import {
  AreaEyebrow,
  AreaTabs,
  type SectionTabItem,
} from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";
import { cn } from "~/core/lib/utils";

// 6 카테고리 — 랜딩 LatestSection 과 색 계열 일관 (brief §4.3).
export type LatestCategory =
  | "laws"
  | "cases"
  | "mcq"
  | "essay"
  | "papers"
  | "books";

// 학습정보 탭 항목 = SSOT(AREA_GROUP_IDS.info) 파생 — 상단바 드롭다운과 동일(합격자 분석 포함).
// dot 색은 to 로 매핑. (CATEGORIES 는 LatestShell 의 카테고리 Icon 룩업·타입에 계속 사용.)
const INFO_DOT_BY_TO: Record<string, string> = {
  "/latest/laws": "bg-emerald-500",
  "/latest/cases": "bg-violet-500",
  "/latest/mcq": "bg-amber-500",
  "/latest/essay": "bg-rose-500",
  "/latest/papers": "bg-sky-500",
  "/latest/book-updates": "bg-[#8B5A2B]",
  "/study/passer-summaries": "bg-teal-500",
};

// 학습정보 탭 — 공용 `SectionTabs` 프리미티브. 학습관리/지원 3 영역과 동일 디자인 톤.
// SectionTabs 가 path 기반 자동 매칭(active 인자는 호환성 유지).
function LatestTabs({ active: _active }: { active: LatestCategory }) {
  const items: SectionTabItem[] = topbarDropdownItems(AREA_GROUP_IDS.info).map(
    (link) => {
      const path = link.to.split("?")[0];
      return {
        id: path,
        to: link.to,
        label: link.label,
        dotClass: INFO_DOT_BY_TO[path],
        match: [path],
      };
    },
  );
  return <AreaTabs ariaLabel="학습정보" items={items} />;
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
  return (
    <>
      {/* 토글 — 최상단 sticky(레이아웃 폭). 순서: 토글 → (backLink) → 헤더 → 내용. */}
      <LatestTabs active={category} />
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
            <AreaEyebrow area="info" />
            <h1 className="text-[28px] font-extrabold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {desc}
            </p>
          </div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </header>
        {children}
      </div>
    </>
  );
}

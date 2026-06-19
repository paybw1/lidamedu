// 커뮤니티 영역 공통 셸 — 헤더(eyebrow·제목·설명) + 본문.
// 공지사항 · 자유게시판 · 스터디 모집 · Q&A · 합격 후기 화면이 공유한다.
// 영역 토글(탭)은 community.layout 의 sticky AreaTabs 가 담당 — 여기서 중복 렌더하지 않는다.
// eyebrow 는 공용 AreaEyebrow(아이콘 + 영역명) — 전 영역 동일 표준(영어 캡션·카테고리 아이콘 폐지).
import type { ReactNode } from "react";

import { Link } from "react-router";

import { AreaEyebrow } from "~/core/components/student";
import { cn } from "~/core/lib/utils";

// 공지사항·Q&A + 게시판 3종(자유·스터디·합격후기) 평탄 구조 — 별도 서브탭 없음.
export type CommunityCategory =
  | "announce"
  | "free"
  | "study"
  | "qna"
  | "review";

// 페이지 폭 — 허브·피드(중간) / 시험지(독서 폭) / 매트릭스(넓게).
const WIDTH_CLASS: Record<"feed" | "narrow" | "wide", string> = {
  feed: "max-w-5xl",
  narrow: "max-w-3xl",
  wide: "max-w-screen-2xl",
};

// 커뮤니티 영역 공통 셸.
export function CommunityShell({
  title,
  desc,
  headerRight,
  backLink,
  width = "feed",
  children,
}: {
  // 호환용 — eyebrow 가 영역 고정이라 더는 사용하지 않지만 호출부 시그니처 유지.
  category?: CommunityCategory;
  title: ReactNode;
  desc?: ReactNode;
  /** 헤더 우측 슬롯 (액션 버튼 등). */
  headerRight?: ReactNode;
  /** 하위 화면의 부모 복귀 링크. */
  backLink?: { to: string; label: string };
  width?: "feed" | "narrow" | "wide";
  children: ReactNode;
}) {
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
          <AreaEyebrow area="community" />
          <h1 className="text-[28px] font-extrabold tracking-tight">{title}</h1>
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

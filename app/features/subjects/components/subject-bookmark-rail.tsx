// 조문·판례·문제 3축 책갈피 레일.
//
// 과목 허브(SubjectHub)는 이 레일을 탭 전환(Radix Tabs)으로, 상세 뷰어
// (조문·판례·문제·장·체계도)는 해당 축 색인으로 가는 링크로 쓴다. 두 쓰임이
// 공유하는 것은 3축 메타(BOOKMARK_AXES)와 탭 1개의 내부 마크업(BookmarkTabInner).
// 허브의 활성 스타일은 Radix `data-[state=active]` 변형이라 SubjectHub 가 직접
// 들고, 이 파일은 뷰어용 링크 레일(SubjectBookmarkRail)만 제공한다.
import type { ComponentType } from "react";

import { BookmarkIcon, GavelIcon, ListChecksIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

import { DEFAULT_SUBJECT_TAB, type SubjectTab } from "../lib/subjects";

interface BookmarkAxis {
  value: SubjectTab;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

/** 책갈피 3축 — 레일 표시 순서대로. 허브·뷰어 공용 SSOT. */
export const BOOKMARK_AXES: readonly BookmarkAxis[] = [
  { value: "articles", icon: BookmarkIcon, label: "조문" },
  { value: "cases", icon: GavelIcon, label: "판례" },
  { value: "problems", icon: ListChecksIcon, label: "문제" },
];

/** 축 → 과목 허브 URL. 기본 탭(조문)은 쿼리 없이 정규 경로로. */
export function bookmarkAxisHref(
  subjectSlug: string,
  axis: SubjectTab,
): string {
  return axis === DEFAULT_SUBJECT_TAB
    ? `/subjects/${subjectSlug}`
    : `/subjects/${subjectSlug}?tab=${axis}`;
}

/**
 * 책갈피 탭 1개의 내부 — 아이콘 + 세로 라벨, 그리고 `count` 가 주어지면
 * 구분선 + 콘텐츠 수. 허브·뷰어 레일 모두 count 를 넘긴다.
 */
export function BookmarkTabInner({
  icon: Icon,
  label,
  count,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <>
      <Icon className="size-[22px]" />
      <span className="text-[14px] font-extrabold tracking-[0.1em] [writing-mode:vertical-rl]">
        {label}
      </span>
      {count !== undefined ? (
        <>
          <span
            aria-hidden="true"
            className="h-px w-3.5 bg-current opacity-30"
          />
          <span className="text-[11px] font-bold tabular-nums opacity-80">
            {count.toLocaleString("ko-KR")}
          </span>
        </>
      ) : null}
    </>
  );
}

/**
 * 상세 뷰어용 책갈피 레일 — 좌측 트리 패널 바깥에 세로로 부착하는 3축 내비.
 *
 * 허브와 달리 탭 전환이 아니라 해당 축의 과목 색인으로 이동하는 링크 3개다.
 * 현재 화면의 축(`active`)은 역상(네이비 채움)으로 강조하고, 활성 탭은 1px
 * 우측 이동해 좌측 트리 패널 변에 맞물린다. 데스크톱 전용(`lg` 미만 숨김) —
 * 모바일 뷰어는 좌측 트리를 시트로 여는 기존 흐름을 그대로 둔다.
 *
 * sticky 위치는 화면마다 헤더 높이가 달라 `className` 으로 호출부가 정한다.
 */
export function SubjectBookmarkRail({
  subjectSlug,
  active,
  counts,
  className,
}: {
  subjectSlug: string;
  active: SubjectTab;
  counts?: Record<SubjectTab, number>;
  className?: string;
}) {
  return (
    <nav
      aria-label="과목 학습 영역"
      className={cn(
        // lg:z-10 — sticky 레일이 스택 컨텍스트를 만들므로, 역시 sticky 인 좌측
        // 트리 패널보다 위에 그려지도록 z 를 올린다(활성 탭 맞물림이 가려지지 않게).
        "hidden w-[58px] shrink-0 flex-col items-stretch gap-2.5 pt-5 lg:z-10 lg:flex",
        className,
      )}
    >
      {BOOKMARK_AXES.map((axis) => {
        const isActive = axis.value === active;
        return (
          <Link
            key={axis.value}
            to={bookmarkAxisHref(subjectSlug, axis.value)}
            viewTransition
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex h-[148px] w-[58px] flex-none flex-col items-center justify-center gap-2 p-0",
              "rounded-l-xl rounded-r-none border border-r-0 transition-all",
              "focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              isActive
                ? "border-primary bg-primary text-primary-foreground z-10 translate-x-px shadow-[-4px_6px_18px_rgba(45,91,168,0.26)]"
                : // 비활성 탭은 bg-muted — 뷰어 트리 패널이 bg-card 라 같은 색이면
                  // 레일이 패널에 묻힌다. muted 로 페이지·패널 양쪽과 대비를 준다.
                  "border-border bg-muted text-muted-foreground hover:bg-primary/[0.06] hover:text-link hover:-translate-x-1.5",
            )}
          >
            <BookmarkTabInner
              icon={axis.icon}
              label={axis.label}
              count={counts?.[axis.value]}
            />
          </Link>
        );
      })}
    </nav>
  );
}

// 조문·판례·문제 3축 책갈피 레일.
//
// 과목 허브(SubjectHub)는 이 레일을 탭 전환(Radix Tabs)으로, 상세 뷰어
// (조문·판례·문제·장·체계도)는 해당 축 색인으로 가는 링크로 쓴다. 두 쓰임이
// 공유하는 것은 3축 메타(BOOKMARK_AXES)와 탭 1개의 내부 마크업(BookmarkTabInner).
// 허브의 활성 스타일은 Radix `data-[state=active]` 변형이라 SubjectHub 가 직접
// 들고, 이 파일은 뷰어용 링크 레일(SubjectBookmarkRail)만 제공한다.
import type { ComponentType } from "react";

import {
  BookmarkIcon,
  GavelIcon,
  ListChecksIcon,
  PenLineIcon,
} from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

import {
  DEFAULT_SUBJECT_TAB,
  LAW_SUBJECTS,
  type LawSubjectSlug,
  type SubjectTab,
} from "../lib/subjects";

interface BookmarkAxis {
  value: SubjectTab;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

/** 책갈피 축 — 레일 표시 순서대로. 허브·뷰어 공용 SSOT. */
export const BOOKMARK_AXES: readonly BookmarkAxis[] = [
  { value: "articles", icon: BookmarkIcon, label: "조문" },
  { value: "cases", icon: GavelIcon, label: "판례" },
  { value: "problems", icon: ListChecksIcon, label: "객관식" },
  { value: "subjective", icon: PenLineIcon, label: "주관식" },
];

/** 과목별 축 — 주관식(2차) 탭은 2차 과목(특·상·디·민소)만. 민법(1차 전용)은 제외. */
export function bookmarkAxesFor(subjectSlug: string): readonly BookmarkAxis[] {
  const meta = LAW_SUBJECTS[subjectSlug as LawSubjectSlug];
  if (meta && meta.exam !== "first") return BOOKMARK_AXES;
  return BOOKMARK_AXES.filter((a) => a.value !== "subjective");
}

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
 * 축 내비 칩 그룹(시안 G2) — 상단 학습과목 바 우측에 놓는 아이콘 칩 4개.
 * "특허법(과목) + 조문(공부 대상)"을 화면 최상단에서 특정한다.
 *
 * 선택된 축 = 네이비 채움 + 라벨·카운트 고정 표시. 미선택 = 아이콘만 보이는
 * 원형 칩, 호버·포커스 시 라벨과 카운트가 확장 애니메이션으로 펼쳐진다.
 * 각 항목 = 해당 축 과목 색인으로 가는 링크. subjects.layout 이 자식 라우트의
 * loaderData(axisCounts)를 useMatches 로 읽어 렌더한다.
 */
export function SubjectAxisChips({
  subjectSlug,
  active,
  counts,
  className,
  showSubjective = false,
}: {
  subjectSlug: string;
  active: SubjectTab;
  counts?: Record<SubjectTab, number>;
  className?: string;
  /** 주관식 축 노출 — 고도화 전 staff 전용이라 호출부가 staff 여부로 넘긴다. */
  showSubjective?: boolean;
}) {
  return (
    <nav
      aria-label="과목 학습 영역"
      className={cn("flex shrink-0 items-center gap-1.5 pl-3", className)}
    >
      {/* 주관식(고도화 전 staff 전용) 축은 호출부가 staff 여부(showSubjective)로 결정. */}
      {bookmarkAxesFor(subjectSlug)
        .filter((a) => a.value !== "subjective" || showSubjective)
        .map((axis) => {
          const isActive = axis.value === active;
          const count = counts?.[axis.value];
          const Icon = axis.icon;
          return (
            <Link
              key={axis.value}
              to={bookmarkAxisHref(subjectSlug, axis.value)}
              viewTransition
              aria-current={isActive ? "page" : undefined}
              title={axis.label}
              className={cn(
                "group border-border inline-flex h-[30px] items-center rounded-full border px-2 text-[12.5px] font-semibold transition-colors",
                "focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "bg-primary border-primary text-primary-foreground font-extrabold shadow-[0_2px_6px_rgba(30,60,110,0.25)]"
                  : "bg-card text-muted-foreground hover:border-primary hover:text-link",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {/* 라벨+카운트 — 선택 칩은 고정, 나머지는 호버/포커스 시 확장(G2 애니메이션). */}
              <span
                className={cn(
                  "flex items-baseline gap-1 overflow-hidden whitespace-nowrap",
                  "transition-all duration-200 ease-out motion-reduce:transition-none",
                  isActive
                    ? "ml-1.5 max-w-24 opacity-100"
                    : "ml-0 max-w-0 opacity-0 group-hover:ml-1.5 group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-24 group-focus-visible:opacity-100",
                )}
              >
                {axis.label}
                {count !== undefined ? (
                  <span
                    className={cn(
                      "text-[10.5px] font-bold tabular-nums",
                      isActive ? "opacity-80" : "opacity-60",
                    )}
                  >
                    {count.toLocaleString("ko-KR")}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
    </nav>
  );
}

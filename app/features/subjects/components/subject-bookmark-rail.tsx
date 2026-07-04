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

/**
 * 과목별 축 — 시험 차수를 따라간다.
 * · 1차 전용(민법): 객관식만 — 주관식 제외.
 * · 2차 전용(민사소송법): 주관식만 — 객관식 제외.
 * · 1·2차(특·상·디): 둘 다.
 */
export function bookmarkAxesFor(subjectSlug: string): readonly BookmarkAxis[] {
  const meta = LAW_SUBJECTS[subjectSlug as LawSubjectSlug];
  if (meta?.exam === "first") {
    return BOOKMARK_AXES.filter((a) => a.value !== "subjective");
  }
  if (meta?.exam === "second") {
    return BOOKMARK_AXES.filter((a) => a.value !== "problems");
  }
  return BOOKMARK_AXES;
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
 * 책갈피 탭 1개의 내부 — 세로 라벨, 그리고 `count` 가 주어지면 구분선 + 콘텐츠 수.
 * 아이콘 없음 — 전 과목 동일한 고정 크기의 홀쭉한 탭.
 */
export function BookmarkTabInner({
  label,
  count,
}: {
  label: string;
  count?: number;
}) {
  return (
    <>
      <span className="text-[14px] font-extrabold tracking-[0.1em] [writing-mode:vertical-rl]">
        {label}
      </span>
      {count !== undefined ? (
        <>
          <span
            aria-hidden="true"
            className="h-px w-3.5 bg-current opacity-30"
          />
          <span className="text-[10px] font-bold tabular-nums opacity-80">
            {count.toLocaleString("ko-KR")}
          </span>
        </>
      ) : null}
    </>
  );
}

/**
 * 뷰어용 책갈피 레일(PC) — 허브의 세로 책갈피 탭과 동일한 룩의 링크 판.
 * 조문·판례·장·체계도·문제 뷰어의 좌측 트리 패널 왼쪽 변에 부착하며,
 * 각 탭은 해당 축의 과목 색인(허브 탭)으로 간다. 활성 축 = 네이비 역상
 * + 1px 우측 이동으로 패널 변에 맞물림. 모바일은 상단 축 칩이 담당(숨김).
 */
export function SubjectBookmarkRail({
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
      className={cn(
        "flex w-[52px] shrink-0 flex-col items-stretch gap-1.5 pt-5",
        className,
      )}
    >
      {bookmarkAxesFor(subjectSlug)
        .filter((a) => a.value !== "subjective" || showSubjective)
        .map((axis) => {
          const isActive = axis.value === active;
          return (
            <Link
              key={axis.value}
              to={bookmarkAxisHref(subjectSlug, axis.value)}
              viewTransition
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex h-[88px] w-[52px] flex-none flex-col items-center justify-center gap-1",
                "rounded-l-xl rounded-r-none border border-r-0 transition-all",
                isActive
                  ? "border-primary bg-primary text-primary-foreground z-10 translate-x-px shadow-[-4px_6px_18px_rgba(45,91,168,0.26)]"
                  : "border-border bg-card text-muted-foreground hover:bg-primary/[0.06] hover:text-link hover:-translate-x-1.5",
              )}
            >
              <BookmarkTabInner
                label={axis.label}
                count={counts?.[axis.value]}
              />
            </Link>
          );
        })}
    </nav>
  );
}

/**
 * 축 내비 칩 그룹 — 상단 학습과목 바 둘째 줄(모바일 전용).
 * PC 는 허브의 세로 책갈피 레일이 축 전환을 담당하므로 SectionTabs 가
 * lg+ 에서 이 슬롯을 렌더하지 않는다.
 *
 * 선택된 축 = 네이비 채움, 미선택 = 테두리 칩. 라벨·카운트는 항상 펼침
 * (터치 환경 — 호버 없음). 각 항목 = 해당 축 과목 색인으로 가는 링크.
 * subjects.layout 이 자식 라우트의 loaderData(axisCounts)를 useMatches 로
 * 읽어 렌더한다.
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
              <span className="ml-1.5 flex items-baseline gap-1 whitespace-nowrap">
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

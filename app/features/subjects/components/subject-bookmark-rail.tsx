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
 * 상세 뷰어용 축 내비 — 좌측 트리 패널 상단 전체 폭의 네이비 스트립(시안 E2b).
 * 세로 레일(구 SubjectBookmarkRail)을 패널 안으로 옮긴 것.
 *
 * 4칸은 얇은 흰 구분선으로 나뉘고, 선택된 축만 밝은 네이비로 점등되면서
 * 스트립 아래로 살짝 돌출(내려오는 탭) — "이 축이 아래 내용을 잡고 있다"는
 * 물리 은유. 색은 primary 위 검정/흰 오버레이로 파생해 다크 모드도 자동 대응.
 * 각 항목 = 해당 축 과목 색인으로 가는 링크. 라벨은 한 줄 고정(whitespace-nowrap).
 */
export function SubjectAxisNav({
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
  /** 주관식 축 노출 — 고도화 전 staff 전용이라 뷰어가 staff 여부로 넘긴다. */
  showSubjective?: boolean;
}) {
  return (
    <nav
      aria-label="과목 학습 영역"
      className={cn(
        "bg-primary relative flex items-stretch divide-x divide-white/15",
        className,
      )}
    >
      {/* 주관식(고도화 전 staff 전용) 축은 호출부가 staff 여부(showSubjective)로 결정. */}
      {bookmarkAxesFor(subjectSlug)
        .filter((a) => a.value !== "subjective" || showSubjective)
        .map((axis) => {
          const isActive = axis.value === active;
          const count = counts?.[axis.value];
          return (
            <Link
              key={axis.value}
              to={bookmarkAxisHref(subjectSlug, axis.value)}
              viewTransition
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-px px-1 py-2 leading-tight",
                "transition-all duration-150",
                "focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none focus-visible:ring-inset",
                isActive
                  ? // 선택 = 밝은 네이비 + 아래로 6px 돌출(내려오는 탭) + 그림자.
                    "z-10 -mb-1.5 rounded-b-lg bg-white/20 pb-3.5 text-white shadow-[0_3px_8px_rgba(15,35,75,0.3)]"
                  : // 미선택 = 더 어두운 네이비. 호버 시 부드럽게 밝아짐(애니메이션).
                    "bg-black/20 text-white/65 hover:bg-black/5 hover:text-white",
              )}
            >
              <span
                className={cn(
                  "text-[13px] whitespace-nowrap",
                  isActive ? "font-extrabold" : "font-semibold",
                )}
              >
                {axis.label}
              </span>
              {count !== undefined ? (
                <span className="text-[9px] font-semibold whitespace-nowrap opacity-75 tabular-nums">
                  {count.toLocaleString("ko-KR")}
                </span>
              ) : null}
            </Link>
          );
        })}
    </nav>
  );
}

// 강의 카탈로그 카테고리(1차/2차/패키지/현장) — 수강신청 탭 필터 SSOT.
// subscription_plans.lecture_category(text) 값과 1:1. 클라(카탈로그·운영자 폼) 공용이라
// 서버 의존 없음.

export const LECTURE_CATEGORIES = [
  "round1",
  "round2",
  "package",
  "onsite",
] as const;

export type LectureCategory = (typeof LECTURE_CATEGORIES)[number];

export const LECTURE_CATEGORY_LABEL: Record<LectureCategory, string> = {
  round1: "1차 강의",
  round2: "2차 강의",
  package: "패키지 강의",
  onsite: "현장 강의",
};

// DB text → 유효 카테고리(아니면 null=미분류).
export function toLectureCategory(v: string | null): LectureCategory | null {
  return v && (LECTURE_CATEGORIES as readonly string[]).includes(v)
    ? (v as LectureCategory)
    : null;
}

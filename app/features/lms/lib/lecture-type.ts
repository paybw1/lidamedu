// 강의 유형(courses.course_type) — 강의 콘텐츠 성격 SSOT. 카탈로그 배지·운영자 폼 공용.
//   plan 레벨 lecture_category(1차/2차/패키지/현장 — 판매 카탈로그 탭)와 별개 축:
//   이쪽은 "무료특강/기본이론/…" 처럼 콘텐츠 자체의 유형. 서버 의존 없음(클라 공용).

export const LECTURE_TYPES = [
  "free_special",
  "theory",
  "advanced",
  "practice",
  "final",
  "special",
] as const;

export type LectureType = (typeof LECTURE_TYPES)[number];

export const LECTURE_TYPE_LABEL: Record<LectureType, string> = {
  free_special: "무료특강",
  theory: "기본이론",
  advanced: "심화",
  practice: "문제풀이",
  final: "파이널",
  special: "특강",
};

// DB text → 유효 유형(아니면 null=미지정).
export function toLectureType(v: string | null): LectureType | null {
  return v && (LECTURE_TYPES as readonly string[]).includes(v)
    ? (v as LectureType)
    : null;
}

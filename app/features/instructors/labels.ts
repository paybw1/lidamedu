// feat-6-012 강사소개 — 계열 라벨 SSOT (client-safe).
// 민사법(civil_law)은 민법(civil)·민사소송법(civil_procedure)으로 분리(2026-07-10).
export type InstructorCategory =
  | "ip_law"
  | "civil"
  | "civil_procedure"
  | "science";

export const CATEGORY_LABEL: Record<
  InstructorCategory,
  { kr: string; en: string }
> = {
  ip_law: { kr: "산업재산권법", en: "IP Law" },
  civil: { kr: "민법", en: "Civil Law" },
  civil_procedure: { kr: "민사소송법", en: "Civil Procedure" },
  science: { kr: "자연과학", en: "Science" },
};

// 강사소개(/about/instructors) 계열 표시 순서 — 민법·산업재산권법·자연과학·민사소송법.
export const CATEGORY_ORDER: InstructorCategory[] = [
  "civil",
  "ip_law",
  "science",
  "civil_procedure",
];

export function isInstructorCategory(v: string): v is InstructorCategory {
  return (
    v === "ip_law" ||
    v === "civil" ||
    v === "civil_procedure" ||
    v === "science"
  );
}

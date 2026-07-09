// feat-6-012 강사소개 — 계열 라벨 SSOT (client-safe).
export type InstructorCategory = "ip_law" | "civil_law" | "science";

export const CATEGORY_LABEL: Record<
  InstructorCategory,
  { kr: string; en: string }
> = {
  ip_law: { kr: "산업재산권법", en: "IP Law" },
  civil_law: { kr: "민사법", en: "Civil Law" },
  science: { kr: "자연과학", en: "Science" },
};

export const CATEGORY_ORDER: InstructorCategory[] = [
  "ip_law",
  "civil_law",
  "science",
];

export function isInstructorCategory(v: string): v is InstructorCategory {
  return v === "ip_law" || v === "civil_law" || v === "science";
}

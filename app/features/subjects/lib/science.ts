// 자연과학 4과목 슬러그 + 표시 메타. 클라이언트/서버 양쪽 import 가능.

export const SCIENCE_SUBJECT_SLUGS = [
  "physics",
  "chemistry",
  "biology",
  "earth_science",
] as const;

export type ScienceSubjectSlug = (typeof SCIENCE_SUBJECT_SLUGS)[number];

// URL 호환 — hub 라우트는 /earth-science(dash) 를 쓰지만 DB enum 은 underscore.
// 둘 중 어느 쪽이 URL 에 와도 정규화한다.
export function normalizeScienceSlug(raw: string): ScienceSubjectSlug | null {
  const normalized = raw === "earth-science" ? "earth_science" : raw;
  return (SCIENCE_SUBJECT_SLUGS as readonly string[]).includes(normalized)
    ? (normalized as ScienceSubjectSlug)
    : null;
}

export const SCIENCE_SUBJECTS: Record<
  ScienceSubjectSlug,
  { name: string; emoji: string }
> = {
  physics: { name: "물리", emoji: "⚛️" },
  chemistry: { name: "화학", emoji: "🧪" },
  biology: { name: "생물", emoji: "🧬" },
  earth_science: { name: "지구과학", emoji: "🌍" },
};

export interface ScienceSection {
  sectionId: string;
  scienceSubject: ScienceSubjectSlug;
  parentId: string | null;
  orderIndex: number;
  code: string | null;
  label: string;
  descriptionMd: string | null;
  problemCount: number;
}

export interface ScienceSectionStats extends ScienceSection {
  attempted: number;
  correct: number;
  accuracyPct: number | null;
}

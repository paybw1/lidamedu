// 자연과학 4과목 슬러그 + 표시 메타. 클라이언트/서버 양쪽 import 가능.

export const SCIENCE_SUBJECT_SLUGS = [
  "physics",
  "chemistry",
  "biology",
  "earth_science",
] as const;

export type ScienceSubjectSlug = (typeof SCIENCE_SUBJECT_SLUGS)[number];

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

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

// DB enum(underscore) → URL path(dash). 과학 라우트는 /earth-science 를 쓴다.
export function scienceSubjectPath(slug: string): string {
  return slug === "earth_science" ? "earth-science" : slug;
}

// 과학 과목명(없으면 "자연과학"). 집계 라벨용.
export function scienceSubjectName(slug: string | null): string {
  const s = slug ? normalizeScienceSlug(slug) : null;
  return s ? SCIENCE_SUBJECTS[s].name : "자연과학";
}

// 과학 문제 viewer href.
export function scienceProblemHref(slug: string, problemId: string): string {
  return `/subjects/science/${scienceSubjectPath(slug)}/problems/${problemId}`;
}

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

// 미완료 퀴즈 세션 이어풀기 정보 — 허브 행동 카드용.
export interface ScienceResumeInfo {
  sessionId: string;
  mode: "study" | "exam";
  answered: number;
  total: number;
  nextProblemId: string;
  startedAt: string;
}

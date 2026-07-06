// 커리큘럼 도메인 타입 + 라벨. 클라/서버 양쪽 import 안전 (DB·service-role 의존 없음).

export type CurriculumItemKind =
  | "article"
  | "case"
  | "problem"
  | "blank_set"
  | "recitation"
  | "lecture";

export const CURRICULUM_ITEM_KINDS: CurriculumItemKind[] = [
  "article",
  "case",
  "problem",
  "blank_set",
  "recitation",
  "lecture",
];

export const CURRICULUM_ITEM_KIND_LABEL: Record<CurriculumItemKind, string> = {
  article: "조문",
  case: "판례",
  problem: "객관식 문제",
  blank_set: "빈칸 세트",
  recitation: "조문 암기",
  lecture: "강의 영상",
};

// 플립드 러닝 단계 — 예습(수업 전)/복습(수업 후). null=단계 미지정(일반 항목).
export type CurriculumItemPhase = "pre" | "post";

export const CURRICULUM_ITEM_PHASES: CurriculumItemPhase[] = ["pre", "post"];

export const CURRICULUM_ITEM_PHASE_LABEL: Record<CurriculumItemPhase, string> =
  {
    pre: "예습",
    post: "복습",
  };

export interface CurriculumListItem {
  curriculumId: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  subjectLaws: string[];
  ownerId: string;
  ownerName: string | null;
  isPublished: boolean;
  weekCount: number;
  itemCount: number;
  cohortCount: number;
  updatedAt: string;
}

export interface CurriculumItem {
  itemId: string;
  weekId: string;
  ord: number;
  kind: CurriculumItemKind;
  articleId: string | null;
  articleLabel: string | null;
  caseId: string | null;
  caseTitle: string | null;
  problemId: string | null;
  problemSnippet: string | null;
  blankSetId: string | null;
  blankSetLabel: string | null;
  lectureTitle: string | null;
  lectureUrl: string | null;
  lectureDurationMin: number | null;
  targetQuantity: number | null;
  note: string | null;
  /** 플립드 러닝 — 예습/복습. null=미지정. */
  phase: CurriculumItemPhase | null;
}

export interface CurriculumWeek {
  weekId: string;
  weekNumber: number;
  title: string;
  goalMd: string | null;
  items: CurriculumItem[];
}

export interface CurriculumDetail extends CurriculumListItem {
  weeks: CurriculumWeek[];
}

export interface CohortCurriculumRow {
  cohortId: string;
  curriculumId: string;
  curriculumName: string;
  startDate: string;
  isActive: boolean;
  assignedAt: string;
}

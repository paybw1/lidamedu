// 클라이언트·서버 공용 타입. queries.server 와 분리해 클라이언트 번들에 import 가능.

export type McqPackKind =
  | "past_exam"
  | "mock_full"
  | "mock_progressive"
  | "other";

export const MCQ_PACK_KIND_LABELS: Record<McqPackKind, string> = {
  past_exam: "기출문제",
  mock_full: "전체 모의고사",
  mock_progressive: "진도별 모의고사",
  other: "기타",
};

export const MCQ_PACK_KIND_SHORT: Record<McqPackKind, string> = {
  past_exam: "기출",
  mock_full: "전체",
  mock_progressive: "진도별",
  other: "기타",
};

// PPT 색인의 "구분" 컬럼 매핑 — 기출/모의 두 갈래로 묶음.
export function isMockKind(kind: McqPackKind): boolean {
  return kind === "mock_full" || kind === "mock_progressive";
}

export type McqPackSubjectScope =
  | "patent"
  | "trademark"
  | "design"
  | "civil"
  | "civil_procedure"
  | "science"
  // 산업재산권법 합본 (특허+상표+디자인) — 합본 모의 등에 사용.
  | "industrial";

export const MCQ_PACK_SUBJECT_LABELS: Record<McqPackSubjectScope, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  civil_procedure: "민사소송법",
  science: "자연과학",
  industrial: "산업재산권법",
};

export interface McqPackItem {
  packId: string;
  kind: McqPackKind;
  subjectScope: McqPackSubjectScope;
  title: string;
  description: string | null;
  year: number | null;
  examRoundNo: number | null;
  durationMin: number | null;
  videoUrl: string | null;
  resultDocUrl: string | null;
  publishedAt: string | null;
  isPublished: boolean;
  /** feat-10-004 — 모의고사 합격선(정답률 %). null = 합격선 없음. */
  passScore: number | null;
  createdAt: string;
  updatedAt: string;
  problemCount: number;
}

export interface McqPackProblemItem {
  problemId: string;
  ord: number;
  problemNumber: number | null;
  format: string;
  origin: string;
  /** feat-10-002 — origin=mock 문제의 학습과목 공개 시각. null = 미공개. */
  releasedAt: string | null;
  year: number | null;
  bodySnippet: string;
  // 첫 문제의 viewer URL prefix 계산용 (industrial pack 도 문제별 law slug 다를 수 있음).
  lawCode: string | null;
  scienceSubject: string | null;
}

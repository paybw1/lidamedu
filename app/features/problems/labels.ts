// 클라이언트·서버 공용 타입/라벨.
import type { Database } from "database.types";

import type {
  BookmarkRecord,
  MemoRecord,
} from "~/features/annotations/labels";

export type ProblemExamRound =
  Database["public"]["Enums"]["problem_exam_round"];
export type ProblemFormat = Database["public"]["Enums"]["problem_format"];
export type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];
export type ProblemPolarity = Database["public"]["Enums"]["problem_polarity"];
export type ProblemScope = Database["public"]["Enums"]["problem_scope"];
export type ProblemChoiceType =
  Database["public"]["Enums"]["problem_choice_type"];
export type OxTruth = Database["public"]["Enums"]["ox_truth"];

// OX 지문 — 조문 viewer 우측 패널/서브젝트 OX 풀이용.
// queries.server.ts 의 fetcher 가 반환하는 데이터 형태 (route loader → 컴포넌트 prop 으로 전달).
// 타입을 labels.ts (non-server) 에 두어 RR vite plugin 이 component → loader 타입 추적 시
// `.server.ts` 의존을 만들지 않게 한다.
export interface OxQuestionItem {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  bodyMd: string;
  oxTruth: OxTruth;
  explanationMd: string | null;
  year: number | null;
  problemNumber: number | null;
  origin: string;
}

export interface OxRefAnnotations {
  memos: MemoRecord[];
  bookmark: BookmarkRecord | null;
}

export const FORMAT_LABEL: Record<ProblemFormat, string> = {
  mc_short: "단답형",
  mc_box: "박스형",
  mc_case: "사례형",
  ox: "OX",
  blank: "빈칸",
  subjective: "주관식",
};

export const ORIGIN_LABEL: Record<ProblemOrigin, string> = {
  past_exam: "기출",
  past_exam_variant: "기출변형",
  expected: "예상문제",
  mock: "모의고사",
};

export const POLARITY_LABEL: Record<ProblemPolarity, string> = {
  positive: "긍정형",
  negative: "부정형",
};

export const SCOPE_LABEL: Record<ProblemScope, string> = {
  unit: "단원",
  comprehensive: "종합",
};

export const CHOICE_TYPE_LABEL: Record<ProblemChoiceType, string> = {
  statute: "조문",
  precedent: "판례",
  theory: "이론",
};

export const CHOICE_TYPE_COLOR: Record<ProblemChoiceType, string> = {
  statute: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  precedent:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  theory:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

// 출처 중 연도/회차 가 의미있는 것 — 기출/기출변형/모의고사. 예상문제는 회차 없음.
export const ORIGIN_HAS_ROUND: Record<ProblemOrigin, boolean> = {
  past_exam: true,
  past_exam_variant: true,
  mock: true,
  expected: false,
};

export interface ProblemListItem {
  problemId: string;
  examRound: ProblemExamRound;
  format: ProblemFormat;
  origin: ProblemOrigin;
  polarity: ProblemPolarity | null;
  scope: ProblemScope | null;
  year: number | null;
  examRoundNo: number | null;
  problemNumber: number | null;
  bodyMd: string;
  primaryArticleId: string | null;
  primaryArticleNumber: string | null;
  primaryArticleLabel: string | null;
  unclassifiedChoices: number;
  reviewedAt: string | null;
  // 문제-해설 불일치 등으로 운영자가 "재검토 필요" 표시한 시각.
  mismatchFlaggedAt: string | null;
  explanationMd: string | null;
  // 강사 풀이 동영상 URL (feat-4-A-315). null = 미등록.
  videoUrl: string | null;
  // 종합/지문/박스 해설 어딘가에 마크다운 표가 있는지.
  hasTable: boolean;
  // 종합/지문/박스 해설 어딘가에 이미지가 있는지.
  hasImage: boolean;
}

export interface ProblemChoice {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  relatedArticleId: string | null;
  relatedArticleNumber: string | null;
  relatedCaseId: string | null;
  relatedCaseNumber: string | null;
  oxIneligible: boolean;
  oxTruth: OxTruth | null;
}

export interface ProblemBoxItem {
  boxItemId: string;
  positionIndex: number;
  marker: string;
  bodyMd: string;
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  relatedArticleId: string | null;
  relatedArticleNumber: string | null;
  relatedCaseId: string | null;
  relatedCaseNumber: string | null;
  oxIneligible: boolean;
  oxTruth: OxTruth | null;
}

export interface ProblemDetail extends ProblemListItem {
  choices: ProblemChoice[];
  boxItems: ProblemBoxItem[];
}

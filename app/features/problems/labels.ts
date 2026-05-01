// 클라이언트·서버 공용 타입/라벨.
import type { Database } from "database.types";

export type ProblemExamRound =
  Database["public"]["Enums"]["problem_exam_round"];
export type ProblemFormat = Database["public"]["Enums"]["problem_format"];
export type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];
export type ProblemPolarity = Database["public"]["Enums"]["problem_polarity"];
export type ProblemScope = Database["public"]["Enums"]["problem_scope"];
export type ProblemChoiceType =
  Database["public"]["Enums"]["problem_choice_type"];

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
}

export interface ProblemChoice {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
  choiceType: ProblemChoiceType | null;
  relatedArticleId: string | null;
  relatedCaseId: string | null;
}

export interface ProblemDetail extends ProblemListItem {
  choices: ProblemChoice[];
}

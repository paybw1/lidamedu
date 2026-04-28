// 클라이언트·서버 공용 타입/라벨.
import type { Database } from "database.types";

export type ProblemExamRound =
  Database["public"]["Enums"]["problem_exam_round"];
export type ProblemFormat = Database["public"]["Enums"]["problem_format"];
export type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];
export type ProblemPolarity = Database["public"]["Enums"]["problem_polarity"];
export type ProblemScope = Database["public"]["Enums"]["problem_scope"];

export const FORMAT_LABEL: Record<ProblemFormat, string> = {
  mc_short: "단답",
  mc_box: "박스",
  mc_case: "사례",
  ox: "OX",
  blank: "빈칸",
  subjective: "주관식",
};

export const ORIGIN_LABEL: Record<ProblemOrigin, string> = {
  past_exam: "기출",
  past_exam_variant: "기출 변형",
  expected: "예상",
  mock: "모의",
};

export const POLARITY_LABEL: Record<ProblemPolarity, string> = {
  positive: "긍정형",
  negative: "부정형",
};

export const SCOPE_LABEL: Record<ProblemScope, string> = {
  unit: "단원",
  comprehensive: "종합",
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
}

export interface ProblemChoice {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
  relatedArticleId: string | null;
  relatedCaseId: string | null;
}

export interface ProblemDetail extends ProblemListItem {
  choices: ProblemChoice[];
}

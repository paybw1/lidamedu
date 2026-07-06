// 객관식 자동 OX 라벨링 규칙.
//
// 규칙(부정형 = "옳지 않은 것은?", 긍정형 = "옳은 것은?"):
// - 부정형: 정답 = X(거짓), 나머지 = O(참)
// - 긍정형: 정답 = O(참),  나머지 = X(거짓)
//
// 적용 범위:
// - choice: mc_short 만 (각 지문이 독립된 진위 판단 단위로 성립)
// - box_item: mc_box 에서 정답 choice body 에 marker 가 포함되면 "정답 그룹" 으로 보고 동일 규칙 적용
//   (mc_box 의 choice 자체는 보기묶음, mc_case 는 사례 의존이라 단독 OX 부적합 → ineligible 기본)

import type {
  OxTruth,
  ProblemFormat,
  ProblemPolarity,
} from "~/features/problems/labels";

const AUTO_OX_CHOICE_FORMATS: ReadonlySet<ProblemFormat> = new Set([
  "mc_short",
]);

// OX 가 단독 진위 판단으로 성립하지 않아 ineligible 을 기본 체크할 유형.
const FORCE_OX_INELIGIBLE_FORMATS: ReadonlySet<ProblemFormat> = new Set([
  "mc_case",
]);

export function isAutoOxChoiceFormat(format: ProblemFormat): boolean {
  return AUTO_OX_CHOICE_FORMATS.has(format);
}

export function isForceOxIneligibleFormat(format: ProblemFormat): boolean {
  return FORCE_OX_INELIGIBLE_FORMATS.has(format);
}

function applyPolarity(
  polarity: ProblemPolarity,
  inAnswerGroup: boolean,
): OxTruth {
  if (polarity === "negative") return inAnswerGroup ? "X" : "O";
  return inAnswerGroup ? "O" : "X";
}

export function deriveChoiceOxTruth(args: {
  polarity: ProblemPolarity | null;
  format: ProblemFormat;
  isCorrect: boolean;
  oxIneligible: boolean;
}): OxTruth | null {
  if (args.oxIneligible) return null;
  if (!args.polarity) return null;
  if (!isAutoOxChoiceFormat(args.format)) return null;
  return applyPolarity(args.polarity, args.isCorrect);
}

// 표시 전용 — 풀이 화면의 선지 O/X 라벨. 정오문제 적격성(ox_ineligible)은 "단독
// 정오문제로 성립하는가"의 문제이고, 풀이 시 지문 진위 표시는 별개 개념이라 무시한다.
// 사례형(mc_case)도 발문 극성만 있으면 정답 여부로 진위를 보여준다.
// mc_box 의 선지는 보기묶음(ㄱ,ㄴ…)이라 O/X 가 성립하지 않음 → null.
export function deriveDisplayChoiceOx(args: {
  polarity: ProblemPolarity | null;
  format: ProblemFormat;
  isCorrect: boolean;
}): OxTruth | null {
  if (!args.polarity) return null;
  if (args.format !== "mc_short" && args.format !== "mc_case") return null;
  return applyPolarity(args.polarity, args.isCorrect);
}

export function deriveBoxItemOxTruth(args: {
  polarity: ProblemPolarity | null;
  format: ProblemFormat;
  marker: string;
  correctChoiceBody: string | null;
  oxIneligible: boolean;
}): OxTruth | null {
  if (args.oxIneligible) return null;
  if (!args.polarity) return null;
  if (args.format !== "mc_box") return null;
  if (!args.correctChoiceBody || !args.marker) return null;
  const inAnswerGroup = args.correctChoiceBody.includes(args.marker);
  return applyPolarity(args.polarity, inAnswerGroup);
}

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

// 해설 원문 앞머리 "○, " / "×, " 진위 표기 제거 — 화면에는 O/X 배지·정답 표시가
// 별도로 붙어 이중 표기가 되므로 표시 직전에만 벗겨낸다(원문 데이터는 보존).
const LEADING_OX_MARK_RE = /^\s*[○◯〇×✕]\s*[,，.、:：]?\s*/;

export function stripLeadingOxMark(text: string): string {
  return text.replace(LEADING_OX_MARK_RE, "");
}

/**
 * 해설 앞머리의 진위 표기(`○, …` / `×. …`)를 읽는다.
 * 저자가 직접 적은 값이라 유도보다 믿을 만하다 — 실제로 유도와 어긋난 8건은 모두
 * 유도 쪽이 틀렸다(개수형 문제). 저장값(ox_truth)과 어긋난 사례는 0건.
 */
export function oxMarkFromExplanation(
  text: string | null | undefined,
): OxTruth | null {
  const m = /^\s*([○◯〇×✕])/.exec(text ?? "");
  if (!m) return null;
  return m[1] === "×" || m[1] === "✕" ? "X" : "O";
}

/**
 * 풀이 화면 박스 보기의 O/X 표시 — 저장값 → 해설 앞머리 표기 → 정답 선지에서 유도.
 *
 * ★해설 표기를 유도보다 앞에 둔다. 배지 바로 옆에 그 글자가 그대로 보이므로,
 *   둘이 어긋나면 학생 눈에 "— 다음에 ×" 처럼 모순으로 읽힌다(실제 신고 사례).
 * ★유도는 정답 선지가 **보기 기호 조합**일 때만 한다. 개수형("5개")은 어떤 기호도
 *   담고 있지 않아 전 보기가 "정답 그룹 아님"으로 읽혀 O/X 가 통째로 뒤집힌다.
 * ★format 은 mc_box 뿐 아니라 mc_case 도 받는다 — 사례 지문에 보기 박스를 단 문제가
 *   mc_case 로 등록돼 있고(209항목), 표시 목적으로는 같은 규칙이 맞다.
 *   (정오문제 적격성 ox_ineligible 은 별개 개념이라 여기서 보지 않는다.)
 */
export function deriveDisplayBoxItemOx(args: {
  oxTruth: OxTruth | null;
  explanationMd: string | null;
  polarity: ProblemPolarity | null;
  format: ProblemFormat;
  marker: string;
  correctChoiceBody: string | null;
  /** 그 문제의 보기 기호 전체 — 정답 선지가 조합형인지 가리는 데 쓴다. */
  allMarkers: readonly string[];
}): OxTruth | null {
  if (args.oxTruth) return args.oxTruth;
  const marked = oxMarkFromExplanation(args.explanationMd);
  if (marked) return marked;
  if (!args.polarity || !args.marker) return null;
  if (args.format !== "mc_box" && args.format !== "mc_case") return null;
  const body = args.correctChoiceBody;
  if (!body) return null;
  const isCombination = args.allMarkers.some((m) => m && body.includes(m));
  if (!isCombination) return null;
  return applyPolarity(args.polarity, body.includes(args.marker));
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

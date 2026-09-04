// feat-2-036 목차 연습 — 채점 실측(구현 전 측정). — 기존 keyword coverage 가 **짧은 제목**에도 성립하는지 본다.
// (feat-2-035 §10.3 이 법리·포섭에서 한 실측과 같은 절차. UI 를 짓기 전에 지표부터.)
import { describe, expect, it } from "vitest";
import { matchAnswer } from "~/features/cases/lib/answer-match";

// 2026년 1번 모범답안의 설문(1) 목차(실제 데이터)
const MODEL_OUTLINE = [
  "Ⅰ. 설문 (1) — 침해금지청구에 관한 쌍방 주장과 검토",
  "1. 문제의 소재",
  "2. 甲의 주장",
  "(1) 구성요소완비의 원칙에 의한 문언침해",
  "(2) 재판상 자백에 의한 뒷받침",
  "(3) 진보성의 인정",
  "3. 乙의 주장",
  "(1) 자백의 부정 — 법적 평가에 관한 진술",
  "(2) 권리남용의 항변",
  "4. 검 토",
  "(1) 자백의 성부",
  "(2) 침해의 성부",
  "(3) 진보성의 판단",
  "(4) 권리남용 항변의 성부",
  "5. 결론",
].join("\n");

// 제대로 쓴 답 — 표현은 다르되 뼈대가 같다
const GOOD = [
  "Ⅰ. 설문 (1) 침해금지청구의 당부",
  "1. 논점의 정리",
  "2. 甲 주장",
  "(1) 구성요소완비 원칙에 따른 문언침해 성립",
  "(2) 재판상 자백",
  "(3) 진보성 부정되지 않음",
  "3. 乙 주장",
  "(1) 법적 평가라서 자백 대상 아님",
  "(2) 무효 명백 — 권리남용 항변",
  "4. 검토",
  "(1) 자백의 성부",
  "(2) 침해 성부",
  "(3) 진보성 판단",
  "(4) 권리남용 항변의 당부",
  "5. 결론 — 청구 인용",
].join("\n");

// 일부만 — 큰 뼈대만 세우고 소목차가 없다
const PARTIAL = ["Ⅰ. 설문 (1)", "1. 문제의 소재", "2. 검토", "3. 결론"].join("\n");

// 엉뚱한 목차 — 다른 논점(정정심판)
const WRONG = [
  "Ⅰ. 논점의 정리",
  "1. 정정심판의 요건",
  "(1) 청구범위 감축",
  "(2) 잘못된 기재의 정정",
  "2. 정정의 소급효",
  "3. 결론",
].join("\n");

describe("목차 연습 채점 — 커버리지가 제목에도 통하는가", () => {
  for (const [name, ans] of [
    ["제대로 쓴 목차", GOOD],
    ["일부만", PARTIAL],
    ["엉뚱한 목차", WRONG],
  ] as const) {
    it(name, () => {
      const r = matchAnswer(MODEL_OUTLINE, ans);
      // eslint-disable-next-line no-console
      console.log(`  ${name}: ratio=${r.ratio.toFixed(2)} matched=${r.matched.length}/${r.matched.length + r.missed.length}`);
      expect(r.ratio).toBeGreaterThanOrEqual(0);
    });
  }
});

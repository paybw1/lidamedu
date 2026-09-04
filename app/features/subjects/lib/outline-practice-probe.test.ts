// feat-2-036 목차 연습 — 채점 실측(설계 §5). UI 를 짓기 전에 지표부터 확인한 기록이다.
//
// 쟁점은 "도식에서 검증된 커버리지 채점이 **짧은 제목**에도 통하는가"였다.
// 법리 본문은 200자인데 목차 한 줄은 10자라, 토큰이 적으면 한두 개 어긋나도 비율이
// 크게 흔들릴 수 있다.
//
// ★실제로 쓰는 경로(`scoreOutline`)로 잰다 — 손으로 만든 문자열을 재면 배포되는
//   동작과 다른 것을 재게 된다(한자 보존 옵션이 여기서만 켜진다).
import { describe, expect, it } from "vitest";

import { parseEssayOutline } from "~/features/subjects/lib/essay-outline";
import { scoreOutline } from "~/features/subjects/lib/essay-outline-score";

// 2026년 1번(특허) 설문 (1) 모범답안의 실제 목차
const MODEL = `## Ⅰ. 설문 (1) — 침해금지청구에 관한 쌍방 주장과 검토 (10점)

### 1. 문제의 소재

번복된 乙의 법정 진술에 재판상 자백이 성립하는지가 문제된다.

### 2. 甲의 주장

#### (1) 구성요소완비의 원칙에 의한 문언침해

보호범위는 청구범위에 적혀 있는 사항에 따라 정하여진다.

#### (2) 재판상 자백에 의한 뒷받침

자백한 사실은 증명을 요하지 아니한다.

#### (3) 진보성의 인정

결합의 곤란성이 인정된다.

### 3. 乙의 주장

#### (1) 자백의 부정 — 법적 평가에 관한 진술

법적 판단 내지 평가에 관한 것이다.

#### (2) 권리남용의 항변

무효로 될 것이 명백하다.

### 4. 검 토

#### (1) 자백의 성부

자백의 대상은 사실이다.

#### (2) 침해의 성부

문언침해라는 결론은 같다.

#### (3) 진보성의 판단

사후적 고찰은 허용되지 아니한다.

#### (4) 권리남용 항변의 성부

무효사유가 명백하지 아니하다.

### 5. 결론

침해금지청구는 인용된다.
`;

const block = parseEssayOutline(MODEL).blocks[0];

/** 제대로 쓴 목차 — 표현은 다르되 뼈대가 같다. */
const GOOD = [
  "Ⅰ. 설문 (1) 침해금지청구의 당부",
  "1. 논점의 정리 — 문제의 소재",
  "2. 甲의 주장",
  "(1) 구성요소완비 원칙에 따른 문언침해",
  "(2) 재판상 자백에 의한 뒷받침",
  "(3) 진보성의 인정",
  "3. 乙의 주장",
  "(1) 법적 평가라 자백의 부정",
  "(2) 권리남용의 항변",
  "4. 검토",
  "(1) 자백의 성부",
  "(2) 침해의 성부",
  "(3) 진보성의 판단",
  "(4) 권리남용 항변의 성부",
  "5. 결론",
].join("\n");

/** 큰 뼈대만 — 소목차가 없다. */
const PARTIAL = ["Ⅰ. 설문 (1)", "1. 문제의 소재", "2. 검토", "3. 결론"].join("\n");

/** 다른 논점(정정심판)의 목차. */
const WRONG = [
  "Ⅰ. 논점의 정리",
  "1. 정정심판의 요건",
  "(1) 청구범위 감축",
  "(2) 잘못된 기재의 정정",
  "2. 정정의 소급효",
  "3. 결론",
].join("\n");

describe("목차 연습 채점 — 커버리지가 제목에도 통하는가", () => {
  it("제대로 쓴 목차는 인정(≥0.65)", () => {
    const s = scoreOutline(block, GOOD);
    // eslint-disable-next-line no-console
    console.log(`  제대로 쓴 목차: ${s.overall.ratio.toFixed(2)} · 항목 ${s.hitCount}/${s.headings.length} · 순서 ${s.orderOk ? "○" : "✕"}`);
    expect(s.verdict).toBe("accepted");
    expect(s.orderOk).toBe(true);
  });

  it("큰 뼈대만 쓴 목차는 미흡(<0.35)", () => {
    const s = scoreOutline(block, PARTIAL);
    // eslint-disable-next-line no-console
    console.log(`  큰 뼈대만: ${s.overall.ratio.toFixed(2)} · 항목 ${s.hitCount}/${s.headings.length}`);
    expect(s.verdict).toBe("weak");
  });

  it("다른 논점의 목차는 미흡", () => {
    const s = scoreOutline(block, WRONG);
    // eslint-disable-next-line no-console
    console.log(`  다른 논점: ${s.overall.ratio.toFixed(2)} · 항목 ${s.hitCount}/${s.headings.length}`);
    expect(s.verdict).toBe("weak");
    expect(s.overall.ratio).toBeLessThan(0.2);
  });

  it("★甲/乙 을 가른다 — 한자를 지우면 두 항목이 같아진다", () => {
    // 甲 쪽만 쓴 목차. 乙 항목이 덩달아 맞은 것으로 잡히면 안 된다.
    const onlyGap = ["Ⅰ. 설문 (1)", "2. 甲의 주장", "(1) 구성요소완비의 원칙에 의한 문언침해"].join("\n");
    const s = scoreOutline(block, onlyGap);
    const gap = s.headings.find((h) => h.title.includes("甲"));
    const eul = s.headings.find((h) => h.title.includes("乙"));
    expect(gap?.hit).toBe(true);
    expect(eul?.hit).toBe(false);
  });
});

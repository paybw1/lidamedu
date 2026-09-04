// feat-2-036 S2 — 목차 채점 단위 검증.
import { describe, expect, it } from "vitest";

import { parseEssayOutline } from "~/features/subjects/lib/essay-outline";
import { scoreOutline } from "~/features/subjects/lib/essay-outline-score";

const MD = `## Ⅰ. 설문 (1) — 침해금지청구

### 1. 문제의 소재

자백이 성립하는지가 문제된다.

### 2. 甲의 주장

#### (1) 구성요소완비의 원칙에 의한 문언침해

보호범위는 청구범위에 따라 정해진다.

#### (2) 재판상 자백에 의한 뒷받침

증명을 요하지 아니한다.

### 3. 乙의 주장

#### (1) 권리남용의 항변

무효로 될 것이 명백하다.

### 4. 결론

청구는 인용된다.
`;

const block = parseEssayOutline(MD).blocks[0];

describe("scoreOutline", () => {
  it("뼈대가 같은 목차는 인정", () => {
    const s = scoreOutline(
      block,
      [
        "Ⅰ. 설문 (1) 침해금지청구의 당부",
        "1. 문제의 소재",
        "2. 甲의 주장",
        "(1) 구성요소완비의 원칙에 따른 문언침해",
        "(2) 재판상 자백에 의한 뒷받침",
        "3. 乙의 주장",
        "(1) 권리남용의 항변",
        "4. 결론",
      ].join("\n"),
    );
    expect(s.verdict).toBe("accepted");
    expect(s.hitCount).toBe(block.headingLines.length);
    expect(s.orderOk).toBe(true);
  });

  it("큰 뼈대만 세우면 미흡", () => {
    const s = scoreOutline(block, ["Ⅰ. 설문 (1)", "1. 문제의 소재", "2. 결론"].join("\n"));
    expect(s.verdict).toBe("weak");
    expect(s.hitCount).toBeLessThan(block.headingLines.length);
  });

  it("다른 논점의 목차는 미흡", () => {
    const s = scoreOutline(
      block,
      ["Ⅰ. 논점의 정리", "1. 정정심판의 요건", "2. 정정의 소급효", "3. 결론"].join("\n"),
    );
    expect(s.verdict).toBe("weak");
  });

  it("★순서가 뒤바뀌면 신호는 뜨되 점수는 그대로다", () => {
    const good = [
      "Ⅰ. 설문 (1) 침해금지청구",
      "1. 문제의 소재",
      "2. 甲의 주장",
      "(1) 구성요소완비의 원칙에 의한 문언침해",
      "(2) 재판상 자백에 의한 뒷받침",
      "3. 乙의 주장",
      "(1) 권리남용의 항변",
      "4. 결론",
    ];
    const shuffled = [good[0], good[7], good[5], good[6], good[2], good[3], good[4], good[1]];
    const a = scoreOutline(block, good.join("\n"));
    const b = scoreOutline(block, shuffled.join("\n"));
    expect(b.overall.ratio).toBeCloseTo(a.overall.ratio, 5); // 점수는 같다
    expect(a.orderOk).toBe(true);
    expect(b.orderOk).toBe(false);
    expect(b.outOfOrder.length).toBeGreaterThan(0);
  });

  it("빈 답은 0점이고 터지지 않는다", () => {
    const s = scoreOutline(block, "");
    expect(s.overall.ratio).toBe(0);
    expect(s.hitCount).toBe(0);
    expect(s.orderOk).toBe(true); // 맞은 게 없으면 순서를 따질 것도 없다
  });

  it("항목별 판정이 제목 수와 맞는다", () => {
    const s = scoreOutline(block, "1. 문제의 소재");
    expect(s.headings).toHaveLength(block.headingLines.length);
    expect(s.headings[1].hit).toBe(true);
    expect(s.headings.filter((h) => h.hit)).toHaveLength(s.hitCount);
  });
});

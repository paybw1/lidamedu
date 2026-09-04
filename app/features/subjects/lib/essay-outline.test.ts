// feat-2-036 S1 — 목차 파서 단위 검증.
// ★검사의 핵심은 "글이 사라지지 않는가"다. 파서가 조용히 한 칸을 버리면 그 칸은
//   연습에서 영영 안 나오고, 아무도 알아채지 못한다.
import { describe, expect, it } from "vitest";

import {
  blockLabel,
  isPracticable,
  outlineText,
  parseEssayOutline,
  walk,
} from "~/features/subjects/lib/essay-outline";

const SUL = `## Ⅰ. 설문 (1) — 침해금지청구

### 1. 문제의 소재

자백이 성립하는지가 문제된다.

### 2. 甲의 주장

#### (1) 구성요소완비의 원칙

보호범위는 청구범위에 따라 정해진다.

#### (2) 재판상 자백

증명을 요하지 아니한다.

### 3. 결론

청구는 인용된다.

---

## Ⅱ. 설문 (2) — 손해배상

### 1. 요 건

침해·고의과실·손해·인과관계가 있어야 한다.
`;

describe("parseEssayOutline", () => {
  it("## 를 블록으로 끊고 층을 트리로 세운다", () => {
    const p = parseEssayOutline(SUL);
    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0].title).toBe("Ⅰ. 설문 (1) — 침해금지청구");
    expect(p.blocks[1].title).toBe("Ⅱ. 설문 (2) — 손해배상");

    const b0 = p.blocks[0];
    // 블록 제목 + 1·2·3 + (1)·(2)
    expect(b0.headingLines).toEqual([
      "Ⅰ. 설문 (1) — 침해금지청구",
      "1. 문제의 소재",
      "2. 甲의 주장",
      "(1) 구성요소완비의 원칙",
      "(2) 재판상 자백",
      "3. 결론",
    ]);
    // (1)·(2) 는 「2. 甲의 주장」의 자식
    const two = b0.nodes[0].children[1];
    expect(two.title).toBe("2. 甲의 주장");
    expect(two.children.map((c) => c.title)).toEqual([
      "(1) 구성요소완비의 원칙",
      "(2) 재판상 자백",
    ]);
  });

  it("본문이 있는 칸만 잎으로 준다", () => {
    const b0 = parseEssayOutline(SUL).blocks[0];
    expect(b0.leaves.map((n) => n.title)).toEqual([
      "1. 문제의 소재",
      "(1) 구성요소완비의 원칙",
      "(2) 재판상 자백",
      "3. 결론",
    ]);
    // 「2. 甲의 주장」은 제목만 — 빈칸으로 내주지 않는다.
    expect(b0.leaves.some((n) => n.title === "2. 甲의 주장")).toBe(false);
  });

  it("구분선(---)은 목차에도 본문에도 들어가지 않는다", () => {
    const p = parseEssayOutline(SUL);
    const all: string[] = [];
    p.blocks.forEach((b) => walk(b.nodes, (n) => all.push(n.title, n.bodyMd)));
    expect(all.join("\n")).not.toMatch(/^-{3,}$/m);
  });

  it("# 은 문서 제목이지 설문이 아니다", () => {
    const p = parseEssayOutline(`# 문제 3 모범답안\n\n## Ⅰ. 서 설\n\n의의를 본다.\n`);
    expect(p.docTitle).toBe("문제 3 모범답안");
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].title).toBe("Ⅰ. 서 설");
  });

  it("★## 바로 아래 본문도 잃지 않는다", () => {
    const p = parseEssayOutline(`## Ⅰ. 서 설\n\n곧바로 시작하는 본문이다.\n\n### 1. 의 의\n\n뜻은 이렇다.\n`);
    const b = p.blocks[0];
    expect(b.nodes[0].bodyMd).toBe("곧바로 시작하는 본문이다.");
    expect(b.leaves.map((n) => n.title)).toEqual(["Ⅰ. 서 설", "1. 의 의"]);
  });

  it("### 로 시작하는 글도 블록이 된다", () => {
    const p = parseEssayOutline(`### 1. 의 의\n\n뜻은 이렇다.\n`);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].title).toBe("1. 의 의");
    expect(p.blocks[0].leaves).toHaveLength(1);
  });

  it("제목 없는 글은 블록 0 · 글 전체가 preamble", () => {
    const p = parseEssayOutline("제목이 하나도 없는 답안이다.");
    expect(p.blocks).toHaveLength(0);
    expect(p.preambleMd).toBe("제목이 하나도 없는 답안이다.");
  });

  it("빈 입력에도 터지지 않는다", () => {
    for (const v of [null, undefined, "", "   \n\n"]) {
      const p = parseEssayOutline(v);
      expect(p.blocks).toHaveLength(0);
    }
  });

  it("id 는 블록 안에서 겹치지 않는다 — 초안 저장 키로 쓴다", () => {
    const p = parseEssayOutline(SUL);
    for (const b of p.blocks) {
      const ids: string[] = [];
      walk(b.nodes, (n) => ids.push(n.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("outlineText 는 채점에 넣을 제목 글을 만든다", () => {
    const b0 = parseEssayOutline(SUL).blocks[0];
    expect(outlineText(b0).split("\n")).toHaveLength(6);
  });

  it("isPracticable — 칸이 없는 블록은 연습을 걸지 않는다", () => {
    const thin = parseEssayOutline("## Ⅰ. 제목만 있다\n").blocks[0];
    expect(isPracticable(thin)).toBe(false);
    expect(isPracticable(parseEssayOutline(SUL).blocks[0])).toBe(true);
  });

  it("본문 줄바꿈을 보존한다 — 문단이 뭉개지면 내용 연습이 못 읽힌다", () => {
    const p = parseEssayOutline(`## Ⅰ. 가\n\n첫 문단.\n\n둘째 문단.\n`);
    expect(p.blocks[0].nodes[0].bodyMd).toBe("첫 문단.\n\n둘째 문단.");
  });
});

describe("blockLabel", () => {
  it("설문 번호와 배점을 제목에서 읽는다", () => {
    const b = parseEssayOutline("## Ⅰ. 설문 (2) — 손해배상 (20점)\n\n### 1. 요건\n\n요건.\n").blocks[0];
    expect(blockLabel(b)).toEqual({ label: "설문 (2)", points: 20 });
  });
  it("설문 표기가 없으면 순번으로 부른다", () => {
    const b = parseEssayOutline("## Ⅰ. 서 설\n\n### 1. 의의\n\n뜻.\n").blocks[0];
    expect(blockLabel(b)).toEqual({ label: "1번째 묶음", points: null });
  });
});

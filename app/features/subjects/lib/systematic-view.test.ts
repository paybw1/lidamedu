import { describe, expect, it } from "vitest";

import { isTopicNode, nodesForView } from "./systematic-view";

// 체계도 한 벌로 세 화면(조문·객관식 / 판례 / 주관식) 목차를 만든다.
// ★핵심은 "숨긴 노드의 자식을 바로 위 보이는 조상으로 올린다" 는 것 — 이게 없으면
//   한쪽 화면에서만 묶음 층 하나를 걷어낼 수 없다(2026-09-07 상표 09 장).

const node = (
  nodeId: string,
  parentId: string | null,
  displayLabel: string,
  extra: Partial<{
    caseDisplayLabel: string | null;
    caseOnly: boolean;
    articleOnly: boolean;
  }> = {},
) => ({
  nodeId,
  parentId,
  displayLabel,
  caseDisplayLabel: extra.caseDisplayLabel ?? null,
  caseOnly: extra.caseOnly ?? false,
  articleOnly: extra.articleOnly ?? false,
});

// 상표 09 장의 실제 모양.
const CHAPTER = [
  node("ch", null, "09 마드리드의정서에 따른 국제출원", {
    caseDisplayLabel: "09 국제출원 및 국제조약",
  }),
  node("wrap", "ch", "마드리드의정서에 따른 국제출원", { caseOnly: true }),
  node("a1", "wrap", "지식재산처를 통한 국제출원 등"),
  node("a2", "wrap", "국제상표등록출원에 관한 특례"),
  node("c1", "wrap", "국제출원 일반", { caseOnly: true }),
  node("t1", "a1", "주제9 국제출원", { caseOnly: true }),
];

const at = (rows: ReturnType<typeof node>[], id: string) =>
  rows.find((r) => r.nodeId === id);

describe("isTopicNode", () => {
  it("판례 배치 층만 골라낸다", () => {
    expect(isTopicNode("주제33 중복심판청구의 금지")).toBe(true);
    expect(isTopicNode("주제 7 사용에 의한 식별력")).toBe(true);
    expect(isTopicNode("본안심리")).toBe(false);
  });
});

describe("nodesForView — 조문·객관식", () => {
  const rows = nodesForView(CHAPTER, "article");

  it("판례 전용 노드를 뺀다", () => {
    expect(rows.map((r) => r.nodeId)).toEqual(["ch", "a1", "a2"]);
  });

  it("숨긴 묶음의 자식을 장 바로 아래로 올린다", () => {
    expect(at(rows, "a1")?.parentId).toBe("ch");
    expect(at(rows, "a2")?.parentId).toBe("ch");
  });

  it("이름은 언제나 조문 이름", () => {
    expect(at(rows, "ch")?.displayLabel).toBe(
      "09 마드리드의정서에 따른 국제출원",
    );
  });
});

describe("nodesForView — 판례", () => {
  const rows = nodesForView(CHAPTER, "case");

  it("묶음 층과 주제 층을 모두 보여 준다", () => {
    expect(rows.map((r) => r.nodeId)).toEqual([
      "ch",
      "wrap",
      "a1",
      "a2",
      "c1",
      "t1",
    ]);
    expect(at(rows, "a1")?.parentId).toBe("wrap");
  });

  it("판례 전용 이름을 쓴다", () => {
    expect(at(rows, "ch")?.displayLabel).toBe("09 국제출원 및 국제조약");
  });
});

describe("nodesForView — 주관식", () => {
  const rows = nodesForView(CHAPTER, "subjective");

  it("판례와 같은 묶음 구조를 쓰되 주제 층은 뺀다", () => {
    expect(rows.map((r) => r.nodeId)).toEqual(["ch", "wrap", "a1", "a2", "c1"]);
    expect(at(rows, "a1")?.parentId).toBe("wrap");
    expect(at(rows, "ch")?.displayLabel).toBe("09 국제출원 및 국제조약");
  });

  it("주제 층의 자식은 위로 올라온다", () => {
    const withChild = [...CHAPTER, node("x", "t1", "주제 아래 항목")];
    const out = nodesForView(withChild, "subjective");
    expect(at(out, "x")?.parentId).toBe("a1");
  });
});

describe("nodesForView — 조문 전용 노드", () => {
  const rows = [
    node("p", null, "등록요건"),
    node("only", "p", "상표의 동일·유사", { articleOnly: true }),
  ];

  it("조문에는 보이고 판례에서는 숨는다", () => {
    expect(nodesForView(rows, "article").map((r) => r.nodeId)).toEqual([
      "p",
      "only",
    ]);
    expect(nodesForView(rows, "case").map((r) => r.nodeId)).toEqual(["p"]);
    expect(nodesForView(rows, "subjective").map((r) => r.nodeId)).toEqual([
      "p",
    ]);
  });
});

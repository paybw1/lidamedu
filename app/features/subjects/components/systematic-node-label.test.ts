import { describe, expect, it } from "vitest";

import {
  parseSystematicNumber,
  systematicNumbers,
} from "./systematic-node-label";

// 배지 번호 — DB 의 ord 는 정렬 키일 뿐이라 그대로 찍으면 안 된다.
// 상표·디자인은 apply-tree.mjs 가 트리 전체 전역 카운터로 ord 를 매겨서
// 대분류가 0 · 21 · 44 … 로 나온다(원장 지적 2026-09-07).

const node = (
  nodeId: string,
  parentId: string | null,
  displayLabel: string,
  ord: number,
) => ({ nodeId, parentId, displayLabel, ord });

describe("parseSystematicNumber", () => {
  it("라벨 앞 번호를 뽑는다 — 맨숫자꼴과 대괄호꼴 둘 다", () => {
    expect(parseSystematicNumber("01 총칙/보칙")).toBe(1);
    expect(parseSystematicNumber("[03] 특허를 받을 수 있는 자")).toBe(3);
    expect(parseSystematicNumber("14 최신판례")).toBe(14);
  });

  it("번호가 없으면 null", () => {
    expect(parseSystematicNumber("상표등록을 받을 수 있는 상표")).toBeNull();
    expect(parseSystematicNumber("주제3 서비스에 대한 상표의 사용")).toBeNull();
  });
});

describe("systematicNumbers", () => {
  it("전역 카운터 ord 를 무시하고 원본 번호를 쓴다 (상표 대분류 실데이터)", () => {
    const no = systematicNumbers([
      node("a", null, "01 총칙/보칙", 0),
      node("b", null, "02 등록요건", 21),
      node("c", null, "03 출원", 44),
      node("d", null, "14 최신판례", 226),
    ]);
    expect([no.a, no.b, no.c, no.d]).toEqual([1, 2, 3, 14]);
  });

  it("원본의 결번을 그대로 살린다 — 디자인은 09 다음이 11", () => {
    const no = systematicNumbers([
      node("a", null, "09 국제출원", 147),
      node("b", null, "11 최신판례", 171),
    ]);
    expect([no.a, no.b]).toEqual([9, 11]);
  });

  it("번호가 없는 층만 형제 순서로 매긴다 — ord 순서 기준", () => {
    const no = systematicNumbers([
      node("p", null, "02 등록요건", 21),
      node("c2", "p", "상표등록을 받을 수 없는 상표", 26),
      node("c1", "p", "상표등록을 받을 수 있는 상표", 22),
      node("c3", "p", "상표등록을 받을 수 있는 자", 37),
    ]);
    expect([no.c1, no.c2, no.c3]).toEqual([1, 2, 3]);
  });

  it("형제 순서는 부모별로 따로 센다", () => {
    const no = systematicNumbers([
      node("p1", null, "01 가", 0),
      node("p2", null, "02 나", 10),
      node("a", "p1", "가의 첫째", 1),
      node("b", "p2", "나의 첫째", 11),
    ]);
    expect([no.a, no.b]).toEqual([1, 1]);
  });

  it("부모가 목록에서 빠져도 남은 형제끼리 순서를 센다", () => {
    // 조문 트리는 caseOnly 노드를 걸러낸다 — 그 자식은 부모 없이 렌더된다.
    const no = systematicNumbers([
      node("a", "gone", "첫째", 5),
      node("b", "gone", "둘째", 9),
    ]);
    expect([no.a, no.b]).toEqual([1, 2]);
  });
});

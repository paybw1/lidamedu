// feat-2-037 S7 — 도해 표 칸 가리기: 목차칸이 다스리는 범위를 못으로 박아 둔다.
// 규칙은 2026-09-11 전 유닛 실측(표 337 · 중간 라벨 1,170칸)에서 나왔다.
import type { DohaeBlock, DohaeCell } from "../labels";

import { describe, expect, it } from "vitest";

import {
  buildCellBlankModel,
  familyOf,
  gridStartCols,
} from "./dohae-cell-blanks";

const c = (text: string, extra: Partial<DohaeCell> = {}): DohaeCell => ({
  text,
  colSpan: 1,
  rowSpan: 1,
  ...extra,
});
const h = (text: string, extra: Partial<DohaeCell> = {}): DohaeCell =>
  c(text, { shade: true, ...extra });
const table = (cells: DohaeCell[][]): DohaeBlock => ({ type: "table", cells });

describe("격자 열 번호", () => {
  it("rowspan 으로 내려온 칸이 자리를 차지해 다음 줄의 첫 칸은 열 1 이다", () => {
    const cells = [
      [h("발명", { rowSpan: 2 }), c("가"), c("나")],
      [c("다"), c("라")],
    ];
    expect(gridStartCols(cells)).toEqual([
      [0, 1, 2],
      [1, 2],
    ]);
  });
});

describe("행·열 목차가 둘 다 있는 표", () => {
  // | 발명 | 물건발명 | 방법발명 |
  // | 의의 |   a      |    b     |
  // | 종류 |   c      |    d     |
  const m = buildCellBlankModel([
    table([
      [h("발명"), h("물건발명"), h("방법발명")],
      [h("의의"), c("a"), c("b")],
      [h("종류"), c("c"), c("d")],
    ]),
  ]);
  it("모서리는 표 전체", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual([
      "b0.r1.c1",
      "b0.r1.c2",
      "b0.r2.c1",
      "b0.r2.c2",
    ]);
  });
  it("열 목차는 그 세로줄", () => {
    expect(m.groups.get("b0.r0.c1")).toEqual(["b0.r1.c1", "b0.r2.c1"]);
  });
  it("행 목차는 그 가로줄", () => {
    expect(m.groups.get("b0.r2.c0")).toEqual(["b0.r2.c1", "b0.r2.c2"]);
  });
  it("가릴 수 있는 칸은 내용칸뿐", () => {
    expect(m.content).toEqual(["b0.r1.c1", "b0.r1.c2", "b0.r2.c1", "b0.r2.c2"]);
  });
});

describe("열 목차만 있는 표", () => {
  const m = buildCellBlankModel([
    table([
      [h("제도"), h("내용")],
      [c("a"), c("b")],
      [c("c"), c("d")],
    ]),
  ]);
  it("첫 열 머리칸도 세로줄만 다스린다(모서리가 아니다)", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r1.c0", "b0.r2.c0"]);
    expect(m.groups.get("b0.r0.c1")).toEqual(["b0.r1.c1", "b0.r2.c1"]);
  });
});

describe("첫 줄이 머리줄이 아닌 표(라벨 + 내용이 섞임)", () => {
  const m = buildCellBlankModel([
    table([
      [h("의의"), c("a")],
      [h("요건"), c("b")],
    ]),
  ]);
  it("첫 줄의 라벨도 가로줄을 다스린다", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r0.c1"]);
    expect(m.groups.get("b0.r1.c0")).toEqual(["b0.r1.c1"]);
  });
});

describe("둘째 열의 작은 라벨(「주체적」·「객체적」)", () => {
  // | 요건(rowspan2) | 주체적 | a |
  // |                | 객체적 | b |
  const m = buildCellBlankModel([
    table([
      [h("요건", { rowSpan: 2 }), h("주체적"), c("a")],
      [h("객체적"), c("b")],
    ]),
  ]);
  it("작은 라벨은 자기 줄의 오른쪽만", () => {
    expect(m.groups.get("b0.r0.c1")).toEqual(["b0.r0.c2"]);
    expect(m.groups.get("b0.r1.c0")).toEqual(["b0.r1.c1"]);
  });
  it("첫 열 라벨은 걸친 두 줄 전부", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r0.c2", "b0.r1.c1"]);
  });
});

describe("중간의 전부 음영인 줄(절 머리)", () => {
  const m = buildCellBlankModel([
    table([
      [h("갑"), h("을")],
      [c("a"), c("b")],
      [h("병", { colSpan: 2 })],
      [c("c"), c("d")],
    ]),
  ]);
  it("그 아래 세로줄을 다스린다", () => {
    expect(m.groups.get("b0.r2.c0")).toEqual(["b0.r3.c0", "b0.r3.c1"]);
  });
  it("첫 줄 머리칸은 절 머리를 건너뛰고 아래 내용칸을 다 든다", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r1.c0", "b0.r3.c0"]);
  });
});

describe("중간 절 머리에 첫 열 라벨이 있는 표", () => {
  // | 구분 | 내용 |
  // | 의의 |  a   |
  // | 요건(전폭)  |
  // | 주체 |  b   |
  const m = buildCellBlankModel([
    table([
      [h("구분"), h("내용")],
      [h("의의"), c("a")],
      [h("요건", { colSpan: 2 })],
      [h("주체"), c("b")],
    ]),
  ]);
  it("절 머리는 모서리가 아니다 — 자기 아래만(위의 a 를 가리지 않는다)", () => {
    expect(m.groups.get("b0.r2.c0")).toEqual(["b0.r3.c1"]);
  });
  it("맨 윗줄 모서리만 표 전체", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r1.c1", "b0.r3.c1"]);
  });
  it("contentSet 은 content 와 같다", () => {
    expect([...m.contentSet]).toEqual(m.content);
  });
});

describe("전폭 각주 줄(「* 단, …」)이 있는 표", () => {
  // | 구분 | 내용 |
  // | 의의 |  a   |
  // | 효과 |  b   |
  // | * 단, 예외 (전폭) |
  const m = buildCellBlankModel([
    table([
      [h("구분"), h("내용")],
      [h("의의"), c("a")],
      [h("효과"), c("b")],
      [c("* 단, 예외", { colSpan: 2 })],
    ]),
  ]);
  it("각주 줄은 행 목차 판정을 깨지 않는다 — 모서리는 표 전체(각주 포함)", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual([
      "b0.r1.c1",
      "b0.r2.c1",
      "b0.r3.c0",
    ]);
  });
  it("세로줄 목차는 각주를 들지 않는다", () => {
    expect(m.groups.get("b0.r0.c1")).toEqual(["b0.r1.c1", "b0.r2.c1"]);
  });
  it("각주는 직접 눌러 가릴 수 있는 칸이다", () => {
    expect(m.contentSet.has("b0.r3.c0")).toBe(true);
  });
});

describe("한 열짜리 표", () => {
  const m = buildCellBlankModel([table([[h("순서")], [c("a")], [c("b")]])]);
  it("머리칸이 아래 전부를 다스린다 — 각주 규칙은 두 열 이상에서만", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r1.c0", "b0.r2.c0"]);
  });
});

describe("걸친 내용칸", () => {
  // | 의의 | a(rowspan2) |
  // | 요건 |             |
  const m = buildCellBlankModel([
    table([[h("의의"), c("a", { rowSpan: 2 })], [h("요건")]]),
  ]);
  it("겹치는 라벨 둘 다에 든다", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r0.c1"]);
    expect(m.groups.get("b0.r1.c0")).toEqual(["b0.r0.c1"]);
  });
});

describe("속표", () => {
  const inner: DohaeCell[][] = [
    [h("구분"), h("효과")],
    [h("갑"), c("x")],
  ];
  const m = buildCellBlankModel([
    table([
      [h("의의"), c("바깥 글", { tables: [inner] })],
      [h("요건"), c("", { tables: [inner] })],
    ]),
  ]);
  it("속표 칸도 가릴 수 있는 칸이고 키는 경로 규칙을 따른다", () => {
    expect(m.content).toEqual([
      "b0.r0.c1.t0.r1.c1",
      "b0.r0.c1",
      "b0.r1.c1.t0.r1.c1",
    ]);
  });
  it("바깥 행 목차는 바깥 칸과 속표 칸을 함께 다스린다", () => {
    expect(m.groups.get("b0.r0.c0")).toEqual(["b0.r0.c1", "b0.r0.c1.t0.r1.c1"]);
  });
  it("글이 없는 바깥 칸은 안 가리지만 그 속표 칸은 다스린다", () => {
    expect(m.groups.get("b0.r1.c0")).toEqual(["b0.r1.c1.t0.r1.c1"]);
  });
  it("속표 안 목차도 제 표 안에서 작동한다", () => {
    expect(m.groups.get("b0.r0.c1.t0.r1.c0")).toEqual(["b0.r0.c1.t0.r1.c1"]);
  });
  it("familyOf 는 바깥 칸과 그 속표 칸", () => {
    expect(familyOf(m, "b0.r0.c1")).toEqual(["b0.r0.c1.t0.r1.c1", "b0.r0.c1"]);
    expect(familyOf(m, "b0.r1.c1")).toEqual(["b0.r1.c1.t0.r1.c1"]);
  });
});

describe("대상이 아닌 것", () => {
  const m = buildCellBlankModel([
    { type: "p", text: "문단" },
    { type: "h", numeral: "Ⅰ", text: "소제목" },
    table([[c("제29조(특허요건) ① 산업상…")]]),
    table([
      [h("구분"), h("그림"), h("빈")],
      [h("의의"), c("도해", { diagram: true }), c("   ")],
    ]),
    {
      type: "diagram",
      texts: [],
    } as unknown as DohaeBlock,
  ]);
  it("조문 박스·그림 칸·원래 빈 칸은 가리지 않는다", () => {
    expect(m.content).toEqual([]);
  });
  it("다스릴 칸이 없는 라벨은 목차로 치지 않는다", () => {
    expect(m.groups.size).toBe(0);
  });
});

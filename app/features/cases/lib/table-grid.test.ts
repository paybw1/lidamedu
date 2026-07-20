import { describe, expect, it } from "vitest";

import {
  addColumn,
  addRow,
  findTableBlocks,
  isEmptyGrid,
  parseTableGrid,
  removeColumn,
  removeRow,
  replaceTableBlock,
  serializeTableGrid,
  toggleMergeLeft,
  toggleMergeUp,
} from "./table-grid";

const SAMPLE = [
  "| 구분 | < | 적극적 | 소극적 |",
  "| --- | --- | --- | --- |",
  "| 권리 대 비권리 | < | 허용 | 허용 |",
  "| 권리 대 권리 | 동종권리 | 원칙 불허 | 허용 |",
  "| ^ | 이종권리 | 허용 | ^ |",
].join("\n");

describe("parseTableGrid", () => {
  it("separator 행을 제거하고 헤더+본문을 그리드로 만든다", () => {
    const g = parseTableGrid(SAMPLE);
    expect(g).not.toBeNull();
    expect(g!.rows).toHaveLength(4); // 헤더1 + 본문3 (separator 제외)
    expect(g!.rows[0]).toEqual(["구분", "<", "적극적", "소극적"]);
    expect(g!.rows[3]).toEqual(["^", "이종권리", "허용", "^"]);
  });

  it("열 수가 다른 행은 빈 셀로 정규화한다", () => {
    const g = parseTableGrid("| a | b | c |\n| --- | --- | --- |\n| x |");
    expect(g!.rows[1]).toEqual(["x", "", ""]);
  });

  it("표가 아니면 null", () => {
    expect(parseTableGrid("그냥 문단")).toBeNull();
    expect(parseTableGrid("| 한 줄만 |")).toBeNull();
  });
});

describe("serializeTableGrid ↔ parse 왕복", () => {
  it("파싱→직렬화→재파싱이 동일한 그리드", () => {
    const g1 = parseTableGrid(SAMPLE)!;
    const md = serializeTableGrid(g1);
    const g2 = parseTableGrid(md)!;
    expect(g2.rows).toEqual(g1.rows);
  });

  it("병합 마커(<, ^)를 보존한다", () => {
    const md = serializeTableGrid(parseTableGrid(SAMPLE)!);
    expect(md).toContain("| 구분 | < | 적극적 | 소극적 |");
    expect(md).toContain("| ^ | 이종권리 | 허용 | ^ |");
    expect(md.split("\n")[1]).toBe("| --- | --- | --- | --- |");
  });

  it("셀 안 파이프는 이스케이프한다", () => {
    const md = serializeTableGrid({ rows: [["a|b", "c"], ["d", "e"]] });
    expect(md.split("\n")[0]).toBe("| a\\|b | c |");
  });
});

describe("행/열 조작", () => {
  it("addRow 는 지정 위치에 빈 행을 넣는다", () => {
    const g = addRow(parseTableGrid(SAMPLE)!, 1);
    expect(g.rows).toHaveLength(5);
    expect(g.rows[1]).toEqual(["", "", "", ""]);
  });

  it("removeRow 는 헤더까지 지워 1행 미만이 되지 않는다", () => {
    let g = { rows: [["a", "b"]] };
    g = removeRow(g, 0);
    expect(g.rows).toHaveLength(1); // 유지
  });

  it("addColumn 은 모든 행에 셀을 추가", () => {
    const g = addColumn(parseTableGrid(SAMPLE)!, 4);
    expect(g.rows.every((r) => r.length === 5)).toBe(true);
  });

  it("removeColumn 은 해당 열을 전 행에서 제거", () => {
    const g = removeColumn(parseTableGrid(SAMPLE)!, 1);
    expect(g.rows[0]).toEqual(["구분", "적극적", "소극적"]);
  });

  it("removeColumn 은 마지막 1열은 지우지 않는다", () => {
    const g = removeColumn({ rows: [["a"], ["b"]] }, 0);
    expect(g.rows[0]).toEqual(["a"]);
  });
});

describe("병합 토글", () => {
  it("toggleMergeLeft 는 셀을 < 로/원복", () => {
    let g = { rows: [["a", "b"], ["c", "d"]] };
    g = toggleMergeLeft(g, 1, 1);
    expect(g.rows[1][1]).toBe("<");
    g = toggleMergeLeft(g, 1, 1);
    expect(g.rows[1][1]).toBe("");
  });

  it("첫 열은 왼쪽 병합 불가", () => {
    const g = toggleMergeLeft({ rows: [["a", "b"]] }, 0, 0);
    expect(g.rows[0][0]).toBe("a");
  });

  it("toggleMergeUp 은 셀을 ^ 로/원복, 첫 행 불가", () => {
    let g = { rows: [["a", "b"], ["c", "d"]] };
    g = toggleMergeUp(g, 1, 0);
    expect(g.rows[1][0]).toBe("^");
    const g2 = toggleMergeUp({ rows: [["a"]] }, 0, 0);
    expect(g2.rows[0][0]).toBe("a");
  });
});

describe("isEmptyGrid", () => {
  it("모든 셀이 공백이면 true", () => {
    expect(isEmptyGrid({ rows: [["", " "], ["", ""]] })).toBe(true);
    expect(isEmptyGrid({ rows: [["a", ""]] })).toBe(false);
  });
});

describe("findTableBlocks / replaceTableBlock", () => {
  const BODY = [
    "첫 문단입니다.",
    "",
    "| 구분 | 값 |",
    "| --- | --- |",
    "| a | 1 |",
    "",
    "가운데 문단.",
    "",
    "| x | y |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "마지막 문단.",
  ].join("\n");

  it("본문 내 표 블록을 순서대로 찾는다", () => {
    const blocks = findTableBlocks(BODY);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].ordinal).toBe(0);
    expect(blocks[0].editable).toBe(true);
    expect(BODY.slice(blocks[0].start, blocks[0].end)).toBe(blocks[0].markdown);
    expect(blocks[0].markdown).toContain("| 구분 | 값 |");
    expect(blocks[1].markdown).toContain("| x | y |");
  });

  it("특정 표만 교체하고 나머지 본문은 그대로", () => {
    const blocks = findTableBlocks(BODY);
    const newMd = serializeTableGrid(
      addRow(parseTableGrid(blocks[1].markdown)!, 3),
    );
    const next = replaceTableBlock(BODY, blocks[1], newMd);
    expect(next).toContain("첫 문단입니다.");
    expect(next).toContain("가운데 문단.");
    expect(next).toContain("마지막 문단.");
    expect(next).toContain("| 구분 | 값 |"); // 첫 표 불변
    // 둘째 표는 행이 하나 늘어남
    expect(findTableBlocks(next)[1].markdown.split("\n")).toHaveLength(4);
  });

  it("표가 없으면 빈 배열", () => {
    expect(findTableBlocks("문단만 있음\n\n또 문단")).toEqual([]);
  });
});

describe("열 폭(colw 디렉티브)", () => {
  const WIDE = [
    "<!--colw:25%,,30em-->",
    "| 구분 | A | B |",
    "| --- | --- | --- |",
    "| 가 | 나 | 다 |",
  ].join("\n");

  it("colw 디렉티브를 파싱해 colWidths 로 담는다", () => {
    const g = parseTableGrid(WIDE);
    expect(g!.colWidths).toEqual(["25%", null, "30em"]);
    expect(g!.rows[0]).toEqual(["구분", "A", "B"]); // 디렉티브는 그리드에 안 섞임
  });

  it("colWidths 를 다시 직렬화하면 디렉티브가 복원된다(round-trip)", () => {
    const g = parseTableGrid(WIDE)!;
    const out = serializeTableGrid(g);
    expect(out.startsWith("<!--colw:25%,,30em-->\n")).toBe(true);
    expect(parseTableGrid(out)!.colWidths).toEqual(["25%", null, "30em"]);
  });

  it("폭이 없으면 디렉티브를 넣지 않는다(기존 표와 동일 원문)", () => {
    const g = parseTableGrid("| a | b |\n| --- | --- |\n| c | d |")!;
    expect(g.colWidths).toBeUndefined();
    expect(serializeTableGrid(g).startsWith("|")).toBe(true);
  });

  it("잘못된 폭 값은 무시(auto)한다", () => {
    const g = parseTableGrid("<!--colw:abc,50%-->\n| a | b |\n| --- | --- |\n| c | d |")!;
    expect(g.colWidths).toEqual([null, "50%"]);
  });

  it("열 삭제 시 해당 열 폭도 함께 제거된다", () => {
    const g = parseTableGrid(WIDE)!;
    const g2 = removeColumn(g, 0); // 25% 열 삭제
    expect(g2.colWidths).toEqual([null, "30em"]);
  });

  it("셀 편집·행 추가로 colWidths 가 유실되지 않는다", () => {
    const g = parseTableGrid(WIDE)!;
    expect(addRow(g, 1).colWidths).toEqual(["25%", null, "30em"]);
    expect(toggleMergeLeft(g, 1, 1).colWidths).toEqual(["25%", null, "30em"]);
  });
});

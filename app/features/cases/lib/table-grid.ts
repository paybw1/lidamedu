// 파이프 마크다운 표 ↔ 2D 그리드 모델 — 시각 표 편집기(스프레드시트형)의 순수 로직.
//
// 그리드는 셀 텍스트 2D 배열(첫 행 = 헤더). 셀 병합은 값 마커로 표현:
//   "<" = 왼쪽 칸과 병합(colspan), "^" = 위 칸과 병합(rowspan).
// 이 규약은 렌더러(case-markdown.ts computeCaseCellSpans)와 동일 — 직렬화 결과는
// 기존 판례 표 마크다운과 100% 호환이라 기존 데이터가 그대로 열리고, 저장해도 형식
// 불변이다. 오프셋 체계(빈칸·하이라이트)는 표 바깥 텍스트에만 걸리므로 무관.

import {
  buildColWidthDirective,
  extractColWidths,
  isMarkdownTableParagraph,
} from "./case-markdown";

export const MERGE_LEFT = "<";
export const MERGE_UP = "^";

export interface TableGrid {
  // rows[0] = 헤더 행. 각 셀은 평문 또는 병합 마커("<"/"^").
  rows: string[][];
  // 열별 폭(길이 = 열 수). 각 값은 "25%"/"30em"/… 또는 null(=auto). 전부 null 이면
  // 직렬화 시 디렉티브를 생략해 기존 표와 동일한 원문이 된다.
  colWidths?: (string | null)[];
}

// colWidths 를 열 수에 맞춰 정규화(부족분 null pad, 초과분 잘라냄).
function alignWidths(
  widths: (string | null)[] | null | undefined,
  cols: number,
): (string | null)[] | undefined {
  if (!widths || !widths.some((w) => w != null)) return undefined;
  const out: (string | null)[] = [];
  for (let i = 0; i < cols; i++) out.push(widths[i] ?? null);
  return out.some((w) => w != null) ? out : undefined;
}

const SEPARATOR_CELL_RE = /^:?-{2,}:?$/;

function splitCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|\s*$/, "");
  return t.split("|").map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL_RE.test(c));
}

// 파이프 표 마크다운 블록 → 그리드. 표가 아니면 null.
// separator 행(| --- | --- |)은 제거하고 헤더 경계로만 쓴다. 열 수는 최대 행 기준으로
// 정규화(부족한 셀은 빈 문자열로 pad) — 편집기는 항상 직사각형 그리드를 전제.
export function parseTableGrid(md: string): TableGrid | null {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (lines.length < 2) return null;
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = splitCells(line);
    if (isSeparatorRow(cells)) continue;
    rows.push(cells);
  }
  if (rows.length === 0) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  if (cols < 1) return null;
  const norm = rows.map((r) => {
    const copy = [...r];
    while (copy.length < cols) copy.push("");
    return copy;
  });
  const colWidths = alignWidths(extractColWidths(md).widths, cols);
  return colWidths ? { rows: norm, colWidths } : { rows: norm };
}

// 셀 텍스트를 파이프 표 셀로 안전 이스케이프 — `|`(구분자)·줄바꿈 제거.
function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
}

// 그리드 → 파이프 표 마크다운. 항상 GFM 표준(헤더 행 + separator + 본문 행) 형태.
// 셀 병합 마커("<"/"^")는 그대로 유지된다.
export function serializeTableGrid(grid: TableGrid): string {
  const rows = grid.rows;
  if (rows.length === 0) return "";
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const copy = r.map(escapeCell);
    while (copy.length < cols) copy.push("");
    return copy.slice(0, cols);
  };
  const out: string[] = [];
  const directive = buildColWidthDirective(
    alignWidths(grid.colWidths, cols) ?? [],
  );
  if (directive) out.push(directive);
  out.push(`| ${pad(rows[0]).join(" | ")} |`);
  out.push(`| ${Array(cols).fill("---").join(" | ")} |`);
  for (let i = 1; i < rows.length; i++) {
    out.push(`| ${pad(rows[i]).join(" | ")} |`);
  }
  return out.join("\n");
}

// 열별 폭 설정(새 그리드 반환). width=null 이면 auto(해제).
export function setColWidth(
  grid: TableGrid,
  col: number,
  width: string | null,
): TableGrid {
  const cols = colCount(grid);
  const widths = [...(grid.colWidths ?? Array(cols).fill(null))];
  while (widths.length < cols) widths.push(null);
  widths[col] = width;
  const aligned = alignWidths(widths, cols);
  return aligned
    ? { rows: grid.rows, colWidths: aligned }
    : { rows: grid.rows };
}

function cloneRows(rows: string[][]): string[][] {
  return rows.map((r) => [...r]);
}

function colCount(grid: TableGrid): number {
  return Math.max(1, ...grid.rows.map((r) => r.length));
}

// ── 행/열 조작 (모두 새 그리드 반환) ──────────────────────────

// 행 조작은 열 수를 바꾸지 않으므로 colWidths 를 그대로 보존한다.
function withRows(grid: TableGrid, rows: string[][]): TableGrid {
  return grid.colWidths ? { rows, colWidths: grid.colWidths } : { rows };
}

export function addRow(grid: TableGrid, at: number): TableGrid {
  const cols = colCount(grid);
  const rows = cloneRows(grid.rows);
  const idx = Math.max(0, Math.min(at, rows.length));
  rows.splice(idx, 0, Array(cols).fill(""));
  return withRows(grid, rows);
}

export function removeRow(grid: TableGrid, at: number): TableGrid {
  if (grid.rows.length <= 1) return grid; // 최소 1행(헤더) 유지
  const rows = cloneRows(grid.rows);
  rows.splice(at, 1);
  return withRows(grid, rows);
}

export function addColumn(grid: TableGrid, at: number): TableGrid {
  const cols = colCount(grid);
  const idx = Math.max(0, Math.min(at, cols));
  const rows = grid.rows.map((r) => {
    const copy = [...r];
    while (copy.length < cols) copy.push("");
    copy.splice(idx, 0, "");
    return copy;
  });
  if (!grid.colWidths) return { rows };
  const widths = [...grid.colWidths];
  while (widths.length < cols) widths.push(null);
  widths.splice(idx, 0, null);
  return { rows, colWidths: widths };
}

export function removeColumn(grid: TableGrid, at: number): TableGrid {
  if (colCount(grid) <= 1) return grid; // 최소 1열 유지
  const rows = grid.rows.map((r) => {
    const copy = [...r];
    if (at < copy.length) copy.splice(at, 1);
    return copy;
  });
  if (!grid.colWidths) return { rows };
  const widths = [...grid.colWidths];
  if (at < widths.length) widths.splice(at, 1);
  return alignWidths(widths, colCount({ rows }))
    ? { rows, colWidths: widths }
    : { rows };
}

// ── 셀 병합 토글 ──────────────────────────────────────────────
// 병합 셀의 원래 내용은 병합 시 사라진다(마커로 대체) — 해제하면 빈 셀이 되고 사용자가
// 다시 입력. 첫 열은 왼쪽 병합 불가, 첫 행(헤더)은 위 병합 불가.

export function toggleMergeLeft(
  grid: TableGrid,
  r: number,
  c: number,
): TableGrid {
  if (c <= 0) return grid;
  const rows = cloneRows(grid.rows);
  rows[r][c] = rows[r][c] === MERGE_LEFT ? "" : MERGE_LEFT;
  return withRows(grid, rows);
}

export function toggleMergeUp(grid: TableGrid, r: number, c: number): TableGrid {
  if (r <= 0) return grid;
  const rows = cloneRows(grid.rows);
  rows[r][c] = rows[r][c] === MERGE_UP ? "" : MERGE_UP;
  return withRows(grid, rows);
}

export function isMergeMarker(text: string): boolean {
  return text === MERGE_LEFT || text === MERGE_UP;
}

// 그리드가 빈 그리드(모든 셀 공백)인지 — 저장 시 표 자체를 제거할지 판단용.
export function isEmptyGrid(grid: TableGrid): boolean {
  return grid.rows.every((r) => r.every((c) => c.trim() === ""));
}

// ── 본문 텍스트 내 표 블록 위치 ────────────────────────────────
// 미리보기(Prose)와 같은 규칙(문단=\n{2,} 분리, isMarkdownTableParagraph 판정)으로
// 표 블록의 원문 오프셋 [start, end)를 잡는다. 편집 버튼이 화면의 N번째 표와
// 정확히 매칭되도록 순서(ordinal)를 Prose 렌더 순서와 일치시킨다.

export interface TableBlock {
  ordinal: number; // 본문에서 몇 번째 표(0-based, Prose 렌더 순서)
  start: number;
  end: number;
  markdown: string; // 앞뒤 공백 제외한 표 원문
  editable: boolean; // 파이프 표(그리드 편집 가능) 여부 — raw HTML <table> 은 false
}

export function findTableBlocks(text: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  const re = /\n{2,}/g;
  let last = 0;
  let ordinal = 0;
  const consider = (segStart: number, segEnd: number) => {
    const raw = text.slice(segStart, segEnd);
    if (raw.trim() === "") return;
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const s = segStart + lead;
    const e = segEnd - trail;
    const para = text.slice(s, e);
    if (!isMarkdownTableParagraph(para)) return;
    blocks.push({
      ordinal: ordinal++,
      start: s,
      end: e,
      markdown: para,
      editable: parseTableGrid(para) !== null,
    });
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    consider(last, m.index);
    last = m.index + m[0].length;
  }
  consider(last, text.length);
  return blocks;
}

// 본문에서 특정 표 블록만 새 마크다운으로 교체(표 바깥 텍스트·오프셋 불변).
export function replaceTableBlock(
  text: string,
  block: { start: number; end: number },
  newMarkdown: string,
): string {
  return text.slice(0, block.start) + newMarkdown + text.slice(block.end);
}

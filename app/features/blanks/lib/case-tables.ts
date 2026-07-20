// 판례 본문(마크다운) 안의 파이프 표를 원시 오프셋 보존한 채 구조화 — 빈칸 편집/풀기
// 뷰가 표를 <table> 로 그리면서도 drag 좌표(data-cum)·빈칸 앵커(cumOffset)는 그대로
// 원시 텍스트 기준을 쓰기 위한 파서. 렌더되지 않는 문자(파이프·구분행)는 선택 불가일 뿐
// 오프셋 체계는 변하지 않는다.

export interface CaseTextPart {
  type: "text";
  text: string;
  start: number; // 원시 텍스트 기준 시작 오프셋
}
export interface CaseTableCell {
  text: string; // trim 된 셀 내용
  start: number; // trim 후 첫 글자의 원시 오프셋
}
export interface CaseTableRow {
  cells: CaseTableCell[];
  separator: boolean; // | --- | --- | 구분행
}
export interface CaseTablePart {
  type: "table";
  rows: CaseTableRow[];
  colWidths?: (string | null)[]; // 열별 폭(colw 디렉티브) — null=auto
}
export type CasePart = CaseTextPart | CaseTablePart;

const TABLE_LINE_RE = /^\s*\|/;
const SEPARATOR_CELL_RE = /^:?-{2,}:?$/;
// 표 바로 위 열 폭 디렉티브(case-markdown.ts SSOT 와 동일 규약). 렌더되지 않는 줄.
const COLW_LINE_RE = /^\s*<!--\s*colw:([^>]*?)-->\s*$/i;
const COLW_VALUE_RE = /^\d{1,3}(?:\.\d+)?(?:%|em|px|rem)$/;
function parseColwLine(raw: string): (string | null)[] | null {
  const m = raw.match(COLW_LINE_RE);
  if (!m) return null;
  const widths = m[1]
    .split(",")
    .map((s) => (COLW_VALUE_RE.test(s.trim()) ? s.trim() : null));
  return widths.some((w) => w !== null) ? widths : null;
}

function parseRow(raw: string, lineStart: number): CaseTableCell[] {
  const cells: CaseTableCell[] = [];
  let i = 0;
  while (i < raw.length && raw[i] === " ") i++;
  if (raw[i] === "|") i++;
  let cellStart = i;
  for (; i <= raw.length; i++) {
    if (i === raw.length || raw[i] === "|") {
      let s = cellStart;
      let e = i;
      while (s < e && /\s/.test(raw[s])) s++;
      while (e > s && /\s/.test(raw[e - 1])) e--;
      cells.push({ text: raw.slice(s, e), start: lineStart + s });
      cellStart = i + 1;
    }
  }
  // 후행 파이프("| a | b |")가 만든 빈 마지막 셀 제거.
  if (cells.length > 0 && cells[cells.length - 1].text === "") cells.pop();
  return cells;
}

// 연속된 파이프 라인 2줄 이상 = 표. 그 외는 원시 텍스트 그대로(개행 포함) text part.
export function splitCaseTables(text: string): CasePart[] {
  const lines: { raw: string; start: number }[] = [];
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    lines.push({ raw: text.slice(pos, end), start: pos });
    if (nl === -1) break;
    pos = nl + 1;
  }

  const parts: CasePart[] = [];
  let textFrom = 0;
  let li = 0;
  const flushText = (upto: number) => {
    if (upto > textFrom) {
      parts.push({ type: "text", text: text.slice(textFrom, upto), start: textFrom });
    }
  };
  while (li < lines.length) {
    if (!TABLE_LINE_RE.test(lines[li].raw)) {
      li++;
      continue;
    }
    let lj = li;
    while (lj < lines.length && TABLE_LINE_RE.test(lines[lj].raw)) lj++;
    if (lj - li < 2) {
      li = lj;
      continue; // 단독 파이프 라인은 표로 안 봄
    }
    // 표 바로 위 colw 디렉티브 줄이 있으면 그 줄까지 텍스트에서 제외(렌더 안 함).
    const colWidths = li > 0 ? parseColwLine(lines[li - 1].raw) : null;
    flushText(colWidths ? lines[li - 1].start : lines[li].start);
    const rows: CaseTableRow[] = [];
    for (let k = li; k < lj; k++) {
      const cells = parseRow(lines[k].raw, lines[k].start);
      const separator =
        cells.length > 0 && cells.every((c) => SEPARATOR_CELL_RE.test(c.text));
      rows.push({ cells, separator });
    }
    parts.push(colWidths ? { type: "table", rows, colWidths } : { type: "table", rows });
    const lastLine = lines[lj - 1];
    textFrom = Math.min(text.length, lastLine.start + lastLine.raw.length + 1);
    li = lj;
  }
  flushText(text.length);
  if (parts.length === 0) parts.push({ type: "text", text, start: 0 });
  return parts;
}

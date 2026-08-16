// 해설편 HWPX 에서 표를 **병합(colSpan/rowSpan)까지 살려** 뽑는다.
//   scripts/hwpx-to-text.mjs 는 hp:cellAddr 만 읽고 hp:cellSpan 을 버려서(주석에 명시)
//   병합 셀이 빈 칸으로 뭉개진 파이프 표가 됐다. 그 손실을 여기서 복구한다.
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
});

function walk(node, fn) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn);
    return;
  }
  if (!node || typeof node !== "object") return;
  fn(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === ":@" || k.startsWith("@_")) continue;
    walk(v, fn);
  }
}

// 텍스트는 hp:t 안에서만 모은다 — 아무 #text 나 주우면 필드·주석 메타가 섞여
// 같은 문구가 두 번 들어간다(hwpx-to-text.paraFromNode 와 같은 규칙).
function textOf(node) {
  let out = "";
  walk(node, (n) => {
    const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
    if (!tk || !(tk === "hp:t" || tk.endsWith(":t"))) return;
    for (const t of n[tk] ?? []) {
      if (typeof t["#text"] === "string") out += t["#text"];
    }
  });
  return out.replace(/\s+/g, " ").trim();
}

/** hp:tbl 노드 → { rows: [[{text,colSpan,rowSpan}]], sig } */
function tableFrom(node) {
  const attrs = node[":@"] ?? {};
  const rowCnt = parseInt(attrs["@_rowCnt"] ?? "0", 10) || 0;
  const colCnt = parseInt(attrs["@_colCnt"] ?? "0", 10) || 0;
  if (!rowCnt || !colCnt) return null;
  const grid = Array.from({ length: rowCnt }, () => Array(colCnt).fill(null));

  walk(node, (n) => {
    const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
    if (tk !== "hp:tc") return;
    let row = 0, col = 0, colSpan = 1, rowSpan = 1, width = 0;
    const paras = [];
    for (const c of n[tk] ?? []) {
      const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
      if (!ck) continue;
      const a = c[":@"] ?? {};
      if (ck === "hp:cellAddr") {
        col = parseInt(a["@_colAddr"] ?? "0", 10) || 0;
        row = parseInt(a["@_rowAddr"] ?? "0", 10) || 0;
      } else if (ck === "hp:cellSz") {
        width = parseInt(a["@_width"] ?? "0", 10) || 0;
      } else if (ck === "hp:cellSpan") {
        colSpan = parseInt(a["@_colSpan"] ?? "1", 10) || 1;
        rowSpan = parseInt(a["@_rowSpan"] ?? "1", 10) || 1;
      } else if (ck === "hp:subList") {
        // 셀 안 문단은 **원본 그대로 줄을 나눠** 보관한다(사용자 지시 2026-08-16).
        // 한 줄로 이어 붙이면 "청구항 1 : … 청구항 2 : …" 처럼 목록이 뭉개진다.
        // 대조용 서명은 아래에서 공백으로 이은 text 를 쓴다(기존 파이프 표와 동일).
        walk(c, (sn) => {
          const stk = Object.keys(sn).find((k) => k !== ":@" && !k.startsWith("@_"));
          if (stk !== "hp:p") return;
          const t = textOf(sn);
          if (t) paras.push(t);
        });
      }
    }
    if (row < rowCnt && col < colCnt)
      grid[row][col] = { paras, text: paras.join(" ").trim(), colSpan, rowSpan, width };
  });

  const rows = grid.map((r) => r.filter(Boolean));
  if (rows.every((r) => r.length === 0)) return null;

  // 열 너비 — 원본 비율을 그대로 옮기기 위해 hp:cellSz/@width 로 계산한다.
  //  · 한 칸짜리 셀은 그 열의 너비를 그대로 알려준다.
  //  · 병합 셀밖에 없는 열은 병합 폭에서 이미 아는 열을 뺀 나머지를 균등 배분.
  const colW = Array(colCnt).fill(0);
  for (let r = 0; r < rowCnt; r++)
    for (let c = 0; c < colCnt; c++) {
      const cell = grid[r][c];
      if (cell && cell.colSpan === 1 && cell.width > 0)
        colW[c] = Math.max(colW[c], cell.width);
    }
  for (let r = 0; r < rowCnt; r++)
    for (let c = 0; c < colCnt; c++) {
      const cell = grid[r][c];
      if (!cell || cell.colSpan <= 1 || !cell.width) continue;
      const span = [];
      let known = 0;
      for (let k = c; k < Math.min(colCnt, c + cell.colSpan); k++) {
        if (colW[k] > 0) known += colW[k];
        else span.push(k);
      }
      if (span.length > 0 && cell.width > known)
        for (const k of span) colW[k] = (cell.width - known) / span.length;
    }
  const total = colW.reduce((a, b) => a + b, 0);
  const colPct = total > 0 && colW.every((w) => w > 0)
    ? colW.map((w) => Math.round((w / total) * 1000) / 10)
    : null;

  return {
    rows,
    rowCnt,
    colCnt,
    colPct,
    sig: signatureOf(rows.flat().map((c) => c.text)),
  };
}

/** 병합 유무와 무관하게 같아지는 지문 — 비어있지 않은 셀 텍스트를 순서대로 이은 것. */
export function signatureOf(texts) {
  return texts
    .map((t) => (t ?? "").replace(/\s+/g, ""))
    .filter(Boolean)
    .join("");
}

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 첫 행을 thead 로 — 기존 파이프 표 변환 규칙과 동일하게 맞춘다. */
export function toHtml(t) {
  // 셀 안 줄바꿈은 원본 문단 그대로 <br> 로 (이스케이프 뒤에 넣어야 태그로 산다).
  //
  // 예외 — **짧은 라벨은 한 줄로 붙인다**(사용자 지시 2026-08-16). 교재에서 `의/사`,
  // `주체적/요건` 처럼 두세 줄로 쌓인 건 칸이 좁아 접힌 것이지 의미상 줄바꿈이 아니다.
  // 판정: 문단이 3개 이하 · 각 문단에 공백이 없음(=낱말 조각) · 이어 붙여도 12자 이하.
  // `청구항 1 : A+B` 처럼 공백을 품은 문단은 여기 걸리지 않아 줄바꿈이 유지된다.
  const isWrappedLabel = (paras) =>
    paras.length > 1 &&
    paras.length <= 3 &&
    paras.every((p) => !/\s/.test(p)) &&
    paras.join(" ").length <= 12;
  const cellHtml = (c) => {
    const paras = c.paras ?? [];
    if (paras.length === 0) return esc(c.text);
    return paras.map(esc).join(isWrappedLabel(paras) ? " " : "<br>");
  };
  const line = (cells, tag) =>
    "<tr>" +
    cells
      .map((c) => {
        const a =
          (c.colSpan > 1 ? ` colspan="${c.colSpan}"` : "") +
          (c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : "");
        return `<${tag}${a}>${cellHtml(c)}</${tag}>`;
      })
      .join("") +
    "</tr>";
  const [head, ...body] = t.rows;
  // 열 너비는 원본 비율 그대로. table-layout:fixed 라야 colgroup 비율이 그대로 선다
  // (auto 면 내용 길이에 따라 브라우저가 다시 나눠 버린다).
  const useCols = t.colPct && t.colPct.length > 1;
  const parts = [
    useCols ? '<table style="table-layout:fixed">' : "<table>",
  ];
  if (useCols)
    parts.push(
      "<colgroup>" +
        t.colPct.map((p) => `<col style="width:${p}%">`).join("") +
        "</colgroup>",
    );
  // 한 칸짜리 표는 교재의 '예시 박스' 다 — 머리글(굵게·음영)이 아니라 본문 칸으로.
  const single = t.rows.length === 1 && head?.length === 1;
  if (single) parts.push("<tbody>", line(head, "td"), "</tbody>");
  else {
    if (head?.length) parts.push("<thead>", line(head, "th"), "</thead>");
    if (body.length) parts.push("<tbody>", ...body.map((r) => line(r, "td")), "</tbody>");
  }
  parts.push("</table>");
  return parts.join("\n");
}

/** hwpx 파일 → 표 배열 (문서 출현 순서) */
export function extractTables(file) {
  const zip = new AdmZip(file);
  const out = [];
  const entries = zip
    .getEntries()
    .filter((e) => /Contents\/section\d+\.xml/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  for (const e of entries) {
    const tree = parser.parse(e.getData().toString("utf8"));
    walk(tree, (n) => {
      const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
      if (tk !== "hp:tbl") return;
      const t = tableFrom(n);
      if (t) out.push(t);
    });
  }
  return out;
}

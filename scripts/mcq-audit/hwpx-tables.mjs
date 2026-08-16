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
    let row = 0, col = 0, colSpan = 1, rowSpan = 1, text = "";
    for (const c of n[tk] ?? []) {
      const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
      if (!ck) continue;
      const a = c[":@"] ?? {};
      if (ck === "hp:cellAddr") {
        col = parseInt(a["@_colAddr"] ?? "0", 10) || 0;
        row = parseInt(a["@_rowAddr"] ?? "0", 10) || 0;
      } else if (ck === "hp:cellSpan") {
        colSpan = parseInt(a["@_colSpan"] ?? "1", 10) || 1;
        rowSpan = parseInt(a["@_rowSpan"] ?? "1", 10) || 1;
      } else if (ck === "hp:subList") {
        // 셀 안 문단들은 공백으로 잇는다 — 기존 파이프 표와 같은 표기가 되도록
        // (세로로 쌓인 라벨 "의/사" → "의 사").
        walk(c, (sn) => {
          const stk = Object.keys(sn).find((k) => k !== ":@" && !k.startsWith("@_"));
          if (stk !== "hp:p") return;
          const t = textOf(sn);
          if (t) text += (text ? " " : "") + t;
        });
      }
    }
    if (row < rowCnt && col < colCnt) grid[row][col] = { text: text.trim(), colSpan, rowSpan };
  });

  const rows = grid.map((r) => r.filter(Boolean));
  if (rows.every((r) => r.length === 0)) return null;
  return { rows, rowCnt, colCnt, sig: signatureOf(rows.flat().map((c) => c.text)) };
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
  const line = (cells, tag) =>
    "<tr>" +
    cells
      .map((c) => {
        const a =
          (c.colSpan > 1 ? ` colspan="${c.colSpan}"` : "") +
          (c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : "");
        return `<${tag}${a}>${esc(c.text)}</${tag}>`;
      })
      .join("") +
    "</tr>";
  const [head, ...body] = t.rows;
  const parts = ["<table>"];
  if (head?.length) parts.push("<thead>", line(head, "th"), "</thead>");
  if (body.length) parts.push("<tbody>", ...body.map((r) => line(r, "td")), "</tbody>");
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

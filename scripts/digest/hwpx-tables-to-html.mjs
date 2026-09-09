// 정리비교표(hwtx/hwpx) → 표 단위 HTML.
//
//   node scripts/digest/hwpx-tables-to-html.mjs <파일> [--out tmp/digest]
//
// ★표만 뽑는다. 이 문서는 쪽마다 성격이 다르다 —
//   깨끗한 표인 쪽(특허요건·이익제도·심사·권리·심판·실용신안법)은 HTML 로 옮길 수 있지만,
//   도형(흐름도)으로 그린 쪽(총칙·소의 제기·PCT·국제조약)은 좌표로 배치된 네모와 선이라
//   HTML 로 옮기면 배치가 무너진다. 그런 쪽은 이 스크립트가 건드리지 않고 세기만 한다.
//
// ★병합 셀(cellSpan)을 반드시 살린다. 예전에 hwpx→text 변환이 이걸 버려서 표가
//   한 줄씩 밀린 적이 있다(메모: hwpx-table-merge-cells).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : "tmp/digest";
if (!file) {
  console.error("사용: node scripts/digest/hwpx-tables-to-html.mjs <파일> [--out 폴더]");
  process.exit(1);
}

const zip = new AdmZip(resolve(file));
const sections = zip
  .getEntries()
  .filter((e) => /^Contents\/section\d+\.xml$/.test(e.entryName))
  .sort((a, b) => a.entryName.localeCompare(b.entryName));

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  preserveOrder: true,
});

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** hp:p 하나의 글. 줄바꿈(hp:lineBreak)은 살린다. */
function paraText(node) {
  let out = "";
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "hp:t") {
        for (const t of Array.isArray(v) ? v : [v]) out += t?.["#text"] ?? "";
      } else if (k === "hp:lineBreak") {
        out += "\n";
      } else {
        walk(v);
      }
    }
  };
  walk(node);
  return out;
}

/** 셀 안의 문단들 → 문단마다 한 줄. 빈 문단은 버린다. */
function cellHtml(sub) {
  const lines = [];
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n)) {
        if (k === ":@") continue;
        if (k === "hp:p") {
          // 표 안의 표는 그대로 중첩해 옮긴다.
          const nested = findTables(v);
          if (nested.length > 0) {
            for (const t of nested) lines.push(tableHtml(t));
            continue;
          }
          const t = paraText(v).trim();
          if (t) lines.push(esc(t).replace(/\n/g, "<br>"));
        } else {
          walk(Array.isArray(v) ? v : [v]);
        }
      }
    }
  };
  walk(sub);
  return lines.join("<br>");
}

/** 이 노드 아래의 hp:tbl 들(바로 아래 한 겹만). */
function findTables(node) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "hp:tbl") out.push(Array.isArray(v) ? v : [v]);
      else walk(v);
    }
  };
  walk(node);
  return out;
}

function tableHtml(tbl) {
  const rows = [];
  const walkRows = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n)) {
        if (k === ":@") continue;
        if (k === "hp:tr") rows.push(v);
        else walkRows(Array.isArray(v) ? v : [v]);
      }
    }
  };
  walkRows(tbl);

  const html = ["<table>"];
  for (const row of rows) {
    html.push("<tr>");
    const cells = [];
    const walkCells = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        for (const [k, v] of Object.entries(n)) {
          if (k === ":@") continue;
          if (k === "hp:tc") cells.push({ body: v, attrs: n[":@"] ?? {} });
          else walkCells(Array.isArray(v) ? v : [v]);
        }
      }
    };
    walkCells(row);

    for (const c of cells) {
      // ★cellSpan 은 hp:tc 의 자식이다(속성 아님).
      let colSpan = 1;
      let rowSpan = 1;
      let sub = null;
      const scan = (nodes) => {
        if (!Array.isArray(nodes)) return;
        for (const n of nodes) {
          for (const [k, v] of Object.entries(n)) {
            if (k === "hp:cellSpan") {
              colSpan = Number(n[":@"]?.["@colSpan"] ?? 1);
              rowSpan = Number(n[":@"]?.["@rowSpan"] ?? 1);
            } else if (k === "hp:subList") {
              sub = v;
            }
          }
        }
      };
      scan(c.body);
      const attrs = [];
      if (colSpan > 1) attrs.push(` colspan="${colSpan}"`);
      if (rowSpan > 1) attrs.push(` rowspan="${rowSpan}"`);
      html.push(`<td${attrs.join("")}>${sub ? cellHtml(sub) : ""}</td>`);
    }
    html.push("</tr>");
  }
  html.push("</table>");
  return html.join("");
}

// ── 쪽 단위로 흐름을 훑는다 ────────────────────────────────────────────────
const pages = []; // { page, tables: [html], shapes: n, texts: [string] }
let page = 1;
const pageOf = (n) => {
  while (pages.length < n) pages.push({ page: pages.length + 1, tables: [], shapes: 0, texts: [] });
  return pages[n - 1];
};
pageOf(1);

for (const [i, entry] of sections.entries()) {
  // ★section 이 바뀌면 쪽도 바뀐다(hwpx 는 구역 시작이 곧 새 쪽). 이걸 빼면 표지·체계도가
  //   첫 본문 쪽에 합쳐져 도형 수가 부풀고 쪽 번호가 통째로 밀린다.
  if (i > 0) pageOf((page += 1));
  const xml = entry.getData().toString("utf8");
  const doc = parser.parse(xml);
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      for (const [k, v] of Object.entries(n)) {
        if (k === ":@") continue;
        if (k === "hp:p") {
          if (n[":@"]?.["@pageBreak"] === "1") pageOf((page += 1));
          const tbls = findTables(v);
          if (tbls.length > 0) {
            for (const t of tbls) pageOf(page).tables.push(tableHtml(t));
          } else {
            const t = paraText(v).trim();
            if (t) pageOf(page).texts.push(t);
          }
          // 도형은 세기만 한다 — 좌표 배치라 HTML 로 옮기지 않는다.
          const s = JSON.stringify(v);
          pageOf(page).shapes +=
            (s.match(/"hp:rect"/g) ?? []).length + (s.match(/"hp:line"/g) ?? []).length;
          continue;
        }
        walk(Array.isArray(v) ? v : [v]);
      }
    }
  };
  walk(doc);
}

mkdirSync(outDir, { recursive: true });
const stem = basename(file).replace(/\.[^.]+$/, "");
writeFileSync(
  resolve(outDir, `${stem}.json`),
  JSON.stringify({ source: file, pages }, null, 2),
  "utf8",
);

console.log(`\n=== ${file} ===`);
console.log("쪽  표  도형  첫 글");
for (const p of pages) {
  const head = (p.texts[0] ?? "").replace(/\s+/g, " ").slice(0, 46);
  console.log(
    `${String(p.page).padStart(2)}p  ${String(p.tables.length).padStart(2)}  ${String(p.shapes).padStart(4)}  ${head}`,
  );
}
const conv = pages.filter((p) => p.tables.length > 0 && p.shapes === 0).length;
console.log(
  `\nHTML 로 옮길 수 있는 쪽 ${conv} / ${pages.length} — 나머지는 도형(흐름도)이라 이미지가 필요하다.`,
);
console.log(`결과: ${resolve(outDir, `${stem}.json`)}`);

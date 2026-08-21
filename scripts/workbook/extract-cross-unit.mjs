// 워크북 원본(HWPX)에서 "타 단원 지문" 표시(기울임체)를 추출한다.
//
// 종합문제의 지문 중 일부는 그 단원만 공부해서는 풀 수 없는 — 다른 단원의 내용을 담은
// 지문이다. 교재는 이를 **기울임체**로 구분해 두었다. 학습 플랫폼은 기울임체를 쓰지
// 않으므로(가독성 컴플레인), 플래그만 뽑아 DB 로 옮기고 화면에서 다른 방식으로 표시한다.
//
// 출력: { problems: [{ headerNo, year, variant, scope, stem, items: [{ marker, text, italic, inTable }] }] }
//   · items 는 선지(①②③④⑤)와 보기 박스 항목(㉠㈎ㄱ. 등)을 모두 담는다.
//   · 표 안(hp:tbl) 여부를 inTable 로 구분한다 — DB 에서 problem_choices / problem_box_items 로 갈린다.
//
//   node scripts/workbook/extract-cross-unit.mjs <input.hwpx> -o tmp/cross-unit.json
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const inputPath = argv[0];
const outIdx = argv.indexOf("-o");
const outputPath = outIdx >= 0 ? argv[outIdx + 1] : null;
if (!inputPath) {
  console.error(
    "usage: node scripts/workbook/extract-cross-unit.mjs <input.hwpx> [-o out.json]",
  );
  process.exit(1);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  preserveOrder: true,
  trimValues: false,
  textNodeName: "#text",
});

const zip = new AdmZip(resolve(inputPath));
const readEntry = (name) =>
  zip
    .getEntries()
    .find((e) => e.entryName === name)
    ?.getData()
    .toString("utf8") ?? null;

const tagOf = (node) =>
  Object.keys(node).find((k) => k !== ":@" && !k.startsWith("@_"));

/** header.xml → italic 인 charPr id 집합. */
function italicCharPrIds() {
  const xml = readEntry("Contents/header.xml");
  const ids = new Set();
  if (!xml) return ids;
  const walk = (nodes) => {
    if (Array.isArray(nodes)) return nodes.forEach(walk);
    if (typeof nodes !== "object" || nodes === null) return;
    const tag = tagOf(nodes);
    if (tag && tag.endsWith(":charPr")) {
      const id = nodes[":@"]?.["@_id"];
      const kids = nodes[tag] ?? [];
      if (id != null && kids.some((c) => tagOf(c)?.endsWith(":italic")))
        ids.add(String(id));
    }
    for (const k of Object.keys(nodes)) {
      if (k === ":@" || k.startsWith("@_")) continue;
      walk(nodes[k]);
    }
  };
  walk(parser.parse(xml));
  return ids;
}

/**
 * 문서 순서대로 hp:p 를 훑어 { text, italic, inTable } 을 만든다.
 * ★표(hp:tbl) 안의 문단도 대상 — 보기 박스가 표로 조판되기 때문이다. 표 안 문단은
 *   inTable=true 로 표시해 DB 에서 problem_box_items 로 보낸다.
 */
function collectParagraphs(xml, italicIds) {
  const out = [];
  const visit = (nodes, tblDepth) => {
    if (Array.isArray(nodes)) return nodes.forEach((n) => visit(n, tblDepth));
    if (typeof nodes !== "object" || nodes === null) return;
    const tag = tagOf(nodes);
    if (!tag) return;
    const kids = nodes[tag] ?? [];
    if (tag.endsWith(":tbl")) return visit(kids, tblDepth + 1);
    if (tag.endsWith(":p")) {
      const para = { text: "", italic: false, inTable: tblDepth > 0 };
      let anyRun = false;
      let allItalic = true;
      // 문단 직속 run 만 읽는다 — 중첩 표는 아래 재귀에서 별도 문단으로 잡힌다.
      for (const child of kids) {
        const ck = tagOf(child);
        if (!ck || !ck.endsWith(":run")) continue;
        const ref = child[":@"]?.["@_charPrIDRef"];
        let runText = "";
        const grab = (n) => {
          if (Array.isArray(n)) return n.forEach(grab);
          if (typeof n !== "object" || n === null) return;
          const tk = tagOf(n);
          if (!tk) return;
          if (tk.endsWith(":tbl")) return; // 표는 별도 문단으로
          if (tk.endsWith(":t")) {
            for (const t of n[tk] ?? [])
              if (typeof t["#text"] === "string") runText += t["#text"];
            return;
          }
          for (const k of Object.keys(n)) {
            if (k === ":@" || k.startsWith("@_")) continue;
            grab(n[k]);
          }
        };
        grab(child[ck] ?? []);
        if (!runText) continue;
        anyRun = true;
        para.text += runText;
        if (!italicIds.has(String(ref))) allItalic = false;
      }
      para.italic = anyRun && allItalic;
      if (para.text.trim()) out.push(para);
      // 문단 안의 표를 이어서 훑는다(문서 순서 유지).
      visit(kids, tblDepth);
      return;
    }
    visit(kids, tblDepth);
  };
  visit(parser.parse(xml), 0);
  return out;
}

// 문제 머리 — "01" + 발문. 연도·구분(’07 / 종합)은 머리 문단 안에 끼워 넣은 작은 표라
// 별도 문단으로 떨어진다. 그 표를 앵커로 삼아 바로 앞 번호 문단을 머리로 확정한다.
const HEADER_RE = /^(\d{1,3})\s*(?=\D)(.*)$/s;
const YEAR_RE = /^[’'`´]\s*(\d{2})\s*(변형)?$/;
const SCOPE_RE = /^(종합|단원)$/;
const CHOICE_RE = /^\s*([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/s;
// 보기 박스 마커 — ㉠㉡…, ㈎㈏…, ㄱ. ㄴ. 등.
const BOX_RE = /^\s*([㈀-㈞㉠-㉾]|[ㄱ-ㅎ]\s*\.)\s*(.*)$/s;

function extract(paras) {
  const problems = [];
  let cur = null;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const t = p.text.trim();

    // ★문제 경계 = 표 안의 "종합"/"단원" 배지. 번호만 보고 자르면 발문 안의 날짜·수치가
    //   새 문제로 잡힌다("2019. 1. 15." 등) — 배지를 앵커로 써서 오탐을 없앤다.
    if (p.inTable && SCOPE_RE.test(t)) {
      let year = null;
      let variant = false;
      let header = null;
      for (let k = i - 1; k >= 0 && k >= i - 8; k--) {
        const q = paras[k];
        const qt = q.text.trim();
        if (q.inTable) {
          const y = YEAR_RE.exec(qt);
          if (y) {
            year = Number(y[1]);
            variant = Boolean(y[2]);
          }
          continue;
        }
        const h = HEADER_RE.exec(qt);
        if (h && h[2].trim().length > 5) header = h;
        break;
      }
      if (!header) continue;
      cur = {
        headerNo: Number(header[1]),
        year,
        variant,
        scope: t === "종합" ? "comprehensive" : "unit",
        stem: header[2].trim(),
        items: [],
      };
      problems.push(cur);
      continue;
    }
    if (!cur) continue;
    if (p.inTable && (YEAR_RE.test(t) || /^[’'`´]?\d{2}$/.test(t))) continue;

    const m = p.inTable ? BOX_RE.exec(t) : CHOICE_RE.exec(t);
    if (!m) {
      // ★번호로 시작하는 문단은 다음 문제의 머리다 — 이어지는 줄로 붙이면 앞 선지 끝에
      //   다음 발문이 끌려 들어가고, 기울임 표시까지 번진다.
      const h = HEADER_RE.exec(t);
      if (!p.inTable && h && h[2].trim().length > 5) continue;
      // 앞 항목의 이어지는 줄 — 원문이 한 항목을 여러 문단으로 쪼개는 경우가 있다.
      const last = cur.items.at(-1);
      if (last && last.inTable === p.inTable) {
        last.text += ` ${t}`;
        if (p.italic) last.italic = true;
      }
      continue;
    }
    cur.items.push({
      marker: m[1],
      text: m[2].trim(),
      italic: p.italic,
      inTable: p.inTable,
    });
  }
  return problems;
}

const italicIds = italicCharPrIds();
const sections = zip
  .getEntries()
  .map((e) => e.entryName)
  .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
  .sort();
const paras = sections.flatMap((s) =>
  collectParagraphs(readEntry(s), italicIds),
);
const problems = extract(paras);

const italicItems = problems.flatMap((p) => p.items.filter((i) => i.italic));
console.log(
  `문단 ${paras.length} · 문제 ${problems.length} · 항목 ${problems.reduce((a, p) => a + p.items.length, 0)}` +
    ` · 기울임 ${italicItems.length} (선지 ${italicItems.filter((i) => !i.inTable).length} · 보기 ${italicItems.filter((i) => i.inTable).length})`,
);
const withItalic = problems.filter((p) => p.items.some((i) => i.italic));
console.log(
  `기울임 보유 문제 ${withItalic.length} — 그중 단원문제 ${withItalic.filter((p) => p.scope === "unit").length}`,
);

if (outputPath) {
  writeFileSync(
    resolve(outputPath),
    JSON.stringify({ source: inputPath, problems }, null, 1),
    "utf8",
  );
  console.log(`✓ ${outputPath}`);
}

// HWPX(Hancom Office XML 포맷, zip+XML) → 구조화된 텍스트 추출.
//
// 출력: { paragraphs: [{ text, italic, bold, alignment, indent, charPrIDRefs:[...] }] }
//   - text: paragraph 안의 모든 <hp:t> 를 join 한 결과.
//   - italic / bold: 첫 run 의 charPr 가 italic / bold 인지 (전체 적용 가정 — 정확하면 더 세분화).
//   - alignment / indent: paraPr 의 align / indent 값.
//
// 사용:
//   node scripts/hwpx-to-text.mjs <path.hwpx> [-o output.json]
//
// 노트:
//   - 이태릭 detection: 종합문제 가 기울임으로 표시된다 (사용자 요구사항). header.xml 의
//     <hh:charPr id="N" italic="..."> 매핑을 만들고, 각 run 의 charPrIDRef 를 lookup.
//   - 박스 내용은 hp:tbl/hp:tc/hp:tcPr 안에 있음. 박스형 문제 처리 시 필요.

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const inputPath = args[0];
const outputPath = (() => {
  const i = args.indexOf("-o");
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return inputPath ? inputPath.replace(/\.hwpx$/i, ".extracted.json") : null;
})();

if (!inputPath) {
  console.error("usage: node scripts/hwpx-to-text.mjs <input.hwpx> [-o output.json]");
  process.exit(1);
}

const zip = new AdmZip(resolve(inputPath));
const entries = zip.getEntries();

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  preserveOrder: true,
  trimValues: false,
  textNodeName: "#text",
  removeNSPrefix: false,
});

function readEntry(name) {
  const e = entries.find((x) => x.entryName === name);
  if (!e) return null;
  return e.getData().toString("utf8");
}

// header.xml 에서 charPr → {italic, bold} map 구축.
function buildCharPrMap() {
  const xml = readEntry("Contents/header.xml");
  if (!xml) return new Map();
  const tree = xmlParser.parse(xml);
  const map = new Map(); // id -> { italic, bold, fontSize, ... }
  walk(tree, (node) => {
    const tag = Object.keys(node).find((k) => k !== ":@" && !k.startsWith("@_"));
    if (!tag) return;
    if (tag === "hh:charPr" || tag.endsWith(":charPr")) {
      const attrs = node[":@"] ?? {};
      const id = attrs["@_id"];
      if (id == null) return;
      // italic / bold 는 child 요소 <hh:italic />, <hh:bold /> 로 표현. 이름만 봐도 충분.
      let italic = false;
      let bold = false;
      const children = node[tag] ?? [];
      for (const c of children) {
        const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
        if (!ck) continue;
        if (ck.endsWith(":italic")) italic = true;
        if (ck.endsWith(":bold")) bold = true;
      }
      map.set(String(id), { italic, bold });
    }
  });
  return map;
}

function walk(nodes, visit) {
  if (Array.isArray(nodes)) {
    for (const n of nodes) walk(n, visit);
    return;
  }
  if (typeof nodes !== "object" || nodes === null) return;
  visit(nodes);
  for (const key of Object.keys(nodes)) {
    if (key === ":@" || key.startsWith("@_")) continue;
    walk(nodes[key], visit);
  }
}

// section XML 을 paragraph 단위로 변환.
function extractParagraphs(charPrMap) {
  const sections = entries
    .map((e) => e.entryName)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort();
  const out = [];
  for (const name of sections) {
    const xml = readEntry(name);
    if (!xml) continue;
    const tree = xmlParser.parse(xml);
    walk(tree, (node) => {
      const tag = Object.keys(node).find((k) => k !== ":@" && !k.startsWith("@_"));
      if (!tag) return;
      if (tag !== "hp:p") return;
      const attrs = node[":@"] ?? {};
      const para = {
        text: "",
        italic: false,
        bold: false,
        runItalic: [], // run 별 italic — 한 paragraph 안에 일부만 italic 인 경우 detect 용
        section: name,
      };
      const children = node[tag] ?? [];
      let firstRunCharPr = null;
      // run iteration
      for (const c of children) {
        const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
        if (!ck) continue;
        if (ck === "hp:run" || ck.endsWith(":run")) {
          const runAttrs = c[":@"] ?? {};
          const runCharPrRef = runAttrs["@_charPrIDRef"];
          if (firstRunCharPr === null) firstRunCharPr = runCharPrRef;
          const cp = runCharPrRef != null ? charPrMap.get(String(runCharPrRef)) : null;
          let runText = "";
          // run 안의 text 추출
          const runChildren = c[ck] ?? [];
          walk(runChildren, (n) => {
            const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
            if (!tk) return;
            if (tk === "hp:t" || tk.endsWith(":t")) {
              const tArr = n[tk] ?? [];
              for (const t of tArr) {
                if (typeof t["#text"] === "string") runText += t["#text"];
              }
            }
          });
          if (runText.length > 0) {
            para.text += runText;
            para.runItalic.push({ text: runText, italic: cp?.italic ?? false, bold: cp?.bold ?? false });
          }
        }
      }
      if (firstRunCharPr != null) {
        const cp = charPrMap.get(String(firstRunCharPr));
        para.italic = cp?.italic ?? false;
        para.bold = cp?.bold ?? false;
      }
      if (para.text.length > 0 || para.runItalic.length > 0) {
        out.push(para);
      }
    });
  }
  return out;
}

const charPrMap = buildCharPrMap();
const paragraphs = extractParagraphs(charPrMap);

const result = {
  inputFile: inputPath,
  charPrCount: charPrMap.size,
  paragraphs,
};

if (outputPath) {
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`✓ ${outputPath} (${paragraphs.length} paragraphs)`);
} else {
  console.log(`paragraphs: ${paragraphs.length}`);
  for (const p of paragraphs.slice(0, 50)) {
    const flag = (p.italic ? "I" : "") + (p.bold ? "B" : "");
    console.log(`[${flag.padEnd(2, " ")}] ${p.text.slice(0, 100)}`);
  }
}

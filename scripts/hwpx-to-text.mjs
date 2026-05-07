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

// 한 hp:p 노드 → 단순 텍스트(+이태릭 정보) paragraph entry.
function paraFromNode(node, charPrMap, sectionName) {
  const tag = "hp:p";
  const para = {
    text: "",
    italic: false,
    bold: false,
    runItalic: [],
    section: sectionName,
    imageRefs: [],
  };
  const children = node[tag] ?? [];
  let firstRunCharPr = null;
  for (const c of children) {
    const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
    if (!ck) continue;
    if (ck === "hp:run" || ck.endsWith(":run")) {
      const runAttrs = c[":@"] ?? {};
      const runCharPrRef = runAttrs["@_charPrIDRef"];
      if (firstRunCharPr === null) firstRunCharPr = runCharPrRef;
      const cp = runCharPrRef != null ? charPrMap.get(String(runCharPrRef)) : null;
      let runText = "";
      const runChildren = c[ck] ?? [];
      // 한 run 안에 hp:t (텍스트) 와 hp:pic (그림) 이 둘 다 있을 수 있다.
      walk(runChildren, (n) => {
        const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
        if (!tk) return;
        if (tk === "hp:t" || tk.endsWith(":t")) {
          const tArr = n[tk] ?? [];
          for (const t of tArr) {
            if (typeof t["#text"] === "string") runText += t["#text"];
          }
        }
        if (tk === "hc:img" || tk.endsWith(":img")) {
          const imgAttrs = n[":@"] ?? {};
          const ref = imgAttrs["@_binaryItemIDRef"];
          if (ref) para.imageRefs.push(ref);
        }
      });
      if (runText.length > 0) {
        para.text += runText;
        para.runItalic.push({
          text: runText,
          italic: cp?.italic ?? false,
          bold: cp?.bold ?? false,
        });
      }
    }
    // hp:pic / hp:ctrl (그림 control) 등 run 형제로 등장하는 그림 처리.
    if (ck === "hp:pic" || ck.endsWith(":pic")) {
      walk([c], (n) => {
        const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
        if (tk === "hc:img" || (tk && tk.endsWith(":img"))) {
          const imgAttrs = n[":@"] ?? {};
          const ref = imgAttrs["@_binaryItemIDRef"];
          if (ref) para.imageRefs.push(ref);
        }
      });
    }
  }
  if (firstRunCharPr != null) {
    const cp = charPrMap.get(String(firstRunCharPr));
    para.italic = cp?.italic ?? false;
    para.bold = cp?.bold ?? false;
  }
  // 그림이 있으면 paragraph 내 marker 형태로 텍스트 끝에 추가 (downstream 에서 url 로 치환).
  // 장식 이미지(chapter 헤더) 는 제거 — paragraph 텍스트에 "제N장" 이 있으면 본문 의미가 아니므로.
  const isChapterHeader = /제\s*\d+\s*장/.test(para.text) ||
    /정답\s*및\s*해설|문\s*[•·]\s*제\s*[•·]\s*편|리담특허법/.test(para.text);
  if (!isChapterHeader) {
    for (const ref of para.imageRefs) {
      para.text += (para.text ? " " : "") + `[IMG:${ref}]`;
    }
  } else {
    para.imageRefs = [];
  }
  return para;
}

// hp:tbl → markdown 표 텍스트 + cells 행렬.
//   cellAddr.colAddr / rowAddr 속성으로 위치 파악.
//   cellSpan colSpan/rowSpan 은 단순 처리(병합 셀은 첫 위치에만 텍스트 두고 나머지는 빈칸).
function tableFromNode(node, charPrMap) {
  const tag = "hp:tbl";
  const attrs = node[":@"] ?? {};
  const rowCnt = parseInt(attrs["@_rowCnt"] ?? "0", 10) || 0;
  const colCnt = parseInt(attrs["@_colCnt"] ?? "0", 10) || 0;
  // 행렬 초기화 (rowCnt x colCnt) — 결측 셀은 빈 문자열.
  const cells = Array.from({ length: rowCnt }, () => Array(colCnt).fill(""));
  // 각 hp:tc 순회.
  walk(node, (n) => {
    const tk = Object.keys(n).find((k) => k !== ":@" && !k.startsWith("@_"));
    if (tk !== "hp:tc") return;
    const tcChildren = n[tk] ?? [];
    let row = 0, col = 0;
    let cellText = "";
    for (const c of tcChildren) {
      const ck = Object.keys(c).find((k) => k !== ":@" && !k.startsWith("@_"));
      if (!ck) continue;
      if (ck === "hp:cellAddr") {
        const cAttr = c[":@"] ?? {};
        col = parseInt(cAttr["@_colAddr"] ?? "0", 10) || 0;
        row = parseInt(cAttr["@_rowAddr"] ?? "0", 10) || 0;
      } else if (ck === "hp:subList") {
        // subList 안의 hp:p 들의 텍스트를 cellText 에 누적.
        walk(c, (sn) => {
          const stk = Object.keys(sn).find((k) => k !== ":@" && !k.startsWith("@_"));
          if (stk !== "hp:p") return;
          const para = paraFromNode(sn, charPrMap, "");
          if (para.text) cellText += (cellText ? " " : "") + para.text;
        });
      }
    }
    if (row < rowCnt && col < colCnt) {
      cells[row][col] = cellText.trim();
    }
  });
  // markdown 표 생성: 첫 행을 header 로, 둘째 행에 ---, 그 이후 데이터.
  // header 만 있는 작은 표여도 OK.
  const lines = [];
  if (cells.length > 0) {
    lines.push("| " + cells[0].map(escMd).join(" | ") + " |");
    lines.push("| " + cells[0].map(() => "---").join(" | ") + " |");
    for (let r = 1; r < cells.length; r++) {
      lines.push("| " + cells[r].map(escMd).join(" | ") + " |");
    }
  }
  return { kind: "table", text: lines.join("\n"), cells, rowCnt, colCnt };
}

function escMd(s) {
  return String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ");
}

// section 트리를 walk 하면서 hp:tbl 은 표 블록으로, hp:p 는 paragraph 블록으로 emit.
// 표 안의 hp:p (셀 내용) 은 별도 paragraph 로 emit 하지 않는다.
function walkSectionForBlocks(node, inTable, out, charPrMap, sectionName) {
  if (Array.isArray(node)) {
    for (const n of node) walkSectionForBlocks(n, inTable, out, charPrMap, sectionName);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const tag = Object.keys(node).find((k) => k !== ":@" && !k.startsWith("@_"));
  if (tag === "hp:tbl") {
    out.push(tableFromNode(node, charPrMap));
    // 중첩 hp:tbl 발견을 위해 inTable=true 로 재귀 (드물지만 안전 장치).
    const children = node[tag] ?? [];
    for (const c of children) walkSectionForBlocks(c, true, out, charPrMap, sectionName);
    return;
  }
  if (tag === "hp:p" && !inTable) {
    const para = paraFromNode(node, charPrMap, sectionName);
    if (para.text.length > 0 || para.runItalic.length > 0) out.push(para);
    // hp:p 안에 embed 된 hp:tbl 이 있을 수 있으므로 children 도 탐색 (paragraph 텍스트는 위에서 추출 완료).
    const children = node[tag] ?? [];
    for (const c of children) walkSectionForBlocks(c, false, out, charPrMap, sectionName);
    return;
  }
  // generic recurse.
  for (const key of Object.keys(node)) {
    if (key === ":@" || key.startsWith("@_")) continue;
    walkSectionForBlocks(node[key], inTable, out, charPrMap, sectionName);
  }
}

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
    walkSectionForBlocks(tree, false, out, charPrMap, name);
  }
  // 후처리 — 각 hp:tbl 직전의 "concat 단일 paragraph" (모든 셀 텍스트가 무간격으로 이어붙은 것)
  // 을 제거. table 블록이 이미 같은 내용을 markdown 으로 보유하므로 중복.
  const cleaned = [];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const next = out[i + 1];
    if (next && next.kind === "table" && cur.kind !== "table") {
      const allCellText = next.cells.flat().join("").replace(/\s+/g, "");
      const curText = (cur.text ?? "").replace(/\s+/g, "");
      if (allCellText.length > 10 && curText.length > 10) {
        // curText 가 allCellText 의 90% 이상 포함하면 concat 으로 간주.
        const overlap = allCellText.length > 0 && curText.includes(allCellText.slice(0, Math.min(allCellText.length, 50)));
        if (overlap) continue; // skip cur
      }
    }
    cleaned.push(cur);
  }
  return cleaned;
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

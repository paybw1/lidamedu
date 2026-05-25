// 특정 사건번호 paragraph 영역의 <hp:pic> 또는 image ref 들을 추출.
//
// 사용: node scripts/precedents/extract-case-pics.mjs 2006다35308

import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const CASE_NUM = process.argv[2];
if (!CASE_NUM) {
  console.error("usage: node scripts/precedents/extract-case-pics.mjs <사건번호>");
  process.exit(1);
}

const HWPX_XML = ".tmp/hwpx-extract/Contents/section0.xml";
const xml = readFileSync(HWPX_XML, "utf-8");
const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  trimValues: false,
});
const tree = parser.parse(xml);

function childrenOf(node) {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  if (keys.length !== 1) return [];
  const v = node[keys[0]];
  if (typeof v === "string") return [];
  return Array.isArray(v) ? v : [];
}
function tagOf(node) {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  return keys[0] ?? null;
}
function attrsOf(node) {
  return node[":@"] ?? {};
}
function textOf(node) {
  if (!node) return "";
  const tag = tagOf(node);
  if (tag === "#text") return String(node["#text"] ?? "");
  if (tag === "hp:t") {
    let s = "";
    for (const c of childrenOf(node)) s += textOf(c);
    return s;
  }
  let s = "";
  for (const c of childrenOf(node)) s += textOf(c);
  return s;
}

function findSection(rootArr) {
  for (const n of rootArr) if (tagOf(n) === "hs:sec") return n;
  return null;
}
const section = findSection(tree);
const paragraphs = [];
(function collectP(n) {
  const t = tagOf(n);
  if (t === "hp:p") {
    paragraphs.push(n);
    return;
  }
  for (const c of childrenOf(n)) collectP(c);
})(section);

// 사건번호 헤더 paragraph index 찾기.
const PARA_HEADER_PREFIX =
  /^(?:묶음 개체입니다\.?\s*)?(?:대법원|특허법원|서울.{0,5}법원|광주.{0,5}법원|부산.{0,5}법원|인천.{0,5}법원|대구.{0,5}법원|대전.{0,5}법원|수원.{0,5}법원|울산.{0,5}법원|창원.{0,5}법원|의정부.{0,5}법원|춘천.{0,5}법원|청주.{0,5}법원|전주.{0,5}법원|제주.{0,5}법원|특허심판원)/;
const CASE_NUM_HEADER_RX =
  /(?<!\d)(\d{2,4}(?:다|허|후|마|두|가합|가단|카합|카단|머|므|호|허단)\d+(?:의\d+)?)(?!\d)/;
const headerIndexes = [];
for (let i = 0; i < paragraphs.length; i++) {
  const txt = textOf(paragraphs[i]).trim();
  if (!PARA_HEADER_PREFIX.test(txt)) continue;
  const cm = txt.match(CASE_NUM_HEADER_RX);
  if (cm) headerIndexes.push({ i, num: cm[1] });
}
const target = headerIndexes.find((h) => h.num === CASE_NUM);
if (!target) {
  console.error(`사건번호 헤더 paragraph 를 찾지 못함: ${CASE_NUM}`);
  process.exit(1);
}
const myIdx = headerIndexes.indexOf(target);
const startP = target.i;
const endP =
  myIdx + 1 < headerIndexes.length
    ? headerIndexes[myIdx + 1].i
    : paragraphs.length;
console.log(`case header at P${startP}, next header at P${endP}`);
console.log(`스코프 paragraph 수: ${endP - startP}`);

// 그 사이 paragraph 들에서 모든 image binData ref 추출.
// HWPX 의 이미지는 <hp:picture><hp:img binaryItemIDRef="image…">… 구조.
const imgRefs = [];
function findImagesInP(p, paraIdx) {
  function recur(node) {
    const t = tagOf(node);
    if (t === "hp:img" || t === "hp:pic" || t === "hp:picture") {
      const attrs = attrsOf(node);
      // hp:img 가 보통 binaryItemIDRef 를 가짐. hp:picture 안 hp:img.
      // 여기서는 모든 attr 을 dump 해서 image ref 후보를 모음.
      const ref =
        attrs["@_binaryItemIDRef"] ??
        attrs["@_BinaryItemIDRef"] ??
        attrs["@_href"] ??
        null;
      imgRefs.push({ paraIdx, tag: t, ref, attrs });
    }
    for (const c of childrenOf(node)) recur(c);
  }
  recur(p);
}
for (let i = startP; i < endP; i++) findImagesInP(paragraphs[i], i);
console.log(`\n발견 이미지 ref: ${imgRefs.length}`);
imgRefs.slice(0, 30).forEach((r, k) => {
  console.log(
    `  [${k}] P${r.paraIdx} tag=${r.tag} ref=${r.ref} attrs=${JSON.stringify(Object.keys(r.attrs))}`,
  );
});

// 본문 텍스트 dump (디버그용).
if (process.argv.includes("--dump-text")) {
  console.log(`\n── paragraph 텍스트 ──`);
  for (let i = startP; i < endP; i++) {
    const t = textOf(paragraphs[i]).trim();
    if (t) console.log(`  [P${i}] ${t.slice(0, 200).replace(/\s+/g, " ")}`);
  }
}

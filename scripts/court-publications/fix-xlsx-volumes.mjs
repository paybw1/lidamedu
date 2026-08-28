// 통합 목록(판례해설 시트)의 권호 열을 법원도서관 총목록으로 바로잡는다.
//
// 왜: xlsx 권호는 2006~2007 구간에서 1~3호씩 밀려 있다. 총목록은 권호·면수·발간반기를
//     함께 싣고 해설 PDF 쪽수와도 맞는다(메모: haeseol-volume-authority).
//
// ★고칠 셀만 인라인 문자열로 바꿔 쓴다 — 공유문자열의 "70호" 를 고치면 그 문자열을
//   쓰는 **다른 행까지 같이** 바뀐다(맞는 행도 틀리게 된다).
// ★서식(s= 속성)은 그대로 물려준다. 필터·숨김 상태도 건드리지 않는다.
//
// 사용:
//   node scripts/court-publications/fix-xlsx-volumes.mjs           # 예행
//   node scripts/court-publications/fix-xlsx-volumes.mjs --apply
import fs from "node:fs";
import AdmZip from "adm-zip";

import { makeFinder, parseToc } from "./lib-haeseol-toc.mjs";

const APPLY = process.argv.includes("--apply");
const XLSX = "source/법원간행물/법원간행물(통합_list).xlsx";
const BACKUP = "source/법원간행물/법원간행물(통합_list).권호수정전.xlsx";
const LOG = "tmp/xlsx-volume-fix.json";

const unesc = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const toc = parseToc();
const findToc = makeFinder(toc);
console.log(`총목록 지식재산권 ${toc.length}건`);

// ── 시트 ────────────────────────────────────────────────────────────────────
const zip = new AdmZip(XLSX);
const wbXml = zip.readAsText("xl/workbook.xml");
const relsXml = zip.readAsText("xl/_rels/workbook.xml.rels");
const target = new Map();
for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g))
  target.set(m[1], `xl/${m[2].replace(/^\//, "")}`);
let entry = null;
for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g))
  if (m[1].includes("판례해설")) entry = target.get(m[2]);
if (!entry) throw new Error("판례해설 시트를 찾지 못했습니다");

const ss = zip.readAsText("xl/sharedStrings.xml");
const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
let xml = zip.readAsText(entry);

const CELL = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>|<c r="([A-Z]+)(\d+)"([^>]*)\/>/g;
const rows = [];
for (const m of xml.matchAll(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g)) {
  const cells = new Map();
  for (const c of m[3].matchAll(CELL)) {
    const col = c[1] ?? c[6];
    let v = "";
    if (c[4] !== undefined) v = /t="s"/.test(c[3] ?? "") ? (shared[Number(c[4])] ?? "") : c[4];
    else if (c[5] !== undefined) v = unesc([...c[5].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
    cells.set(col, { value: v, raw: c[0], attrs: c[3] ?? c[8] ?? "" });
  }
  rows.push({ r: Number(m[1]), cells, raw: m[0] });
}
const header = rows.find((x) => x.r === 1);
const colOf = (name) => [...header.cells].find(([, c]) => c.value.trim() === name)?.[0];
const C = { title: colOf("논문 제목"), author: colOf("저자"), vol: colOf("권호"), no: colOf("번호"), gubun: colOf("구분") };
if (!C.vol || !C.title) throw new Error("권호/논문 제목 열을 찾지 못했습니다");
console.log(`시트 ${entry} · 권호 열 ${C.vol} · 데이터 ${rows.length - 1}행`);

const plan = [], unmatched = [];
for (const row of rows) {
  if (row.r === 1) continue;
  const title = row.cells.get(C.title)?.value ?? "";
  const author = row.cells.get(C.author)?.value ?? "";
  const cur = row.cells.get(C.vol);
  if (!title || !cur) continue;
  const e = findToc(title, author);
  if (!e) { unmatched.push({ no: row.cells.get(C.no)?.value, gubun: row.cells.get(C.gubun)?.value, vol: cur.value, title: title.slice(0, 40) }); continue; }
  const want = `${e.vol}호`;
  if (want === cur.value.trim()) continue;
  plan.push({ r: row.r, no: row.cells.get(C.no)?.value, gubun: row.cells.get(C.gubun)?.value, before: cur.value, after: want, page: e.page, pub: e.pub, title: title.slice(0, 36) });
}
console.log(`고칠 셀 ${plan.length} · 총목록에 없어 그대로 둔 행 ${unmatched.length}`);
for (const p of plan) console.log(`  ${p.r}행 #${p.no} ${p.gubun} : ${p.before} → ${p.after} (${p.page}면, ${p.pub}) | ${p.title}`);
if (!APPLY) { console.log("예행 — 반영하려면 --apply"); process.exit(0); }

// ── 쓰기 ────────────────────────────────────────────────────────────────────
for (const p of plan) {
  const row = rows.find((x) => x.r === p.r);
  const cell = row.cells.get(C.vol);
  // t="s" 를 떼고 인라인 문자열로. 서식(s=)은 유지.
  const style = /\ss="(\d+)"/.exec(cell.attrs)?.[0] ?? "";
  const next = `<c r="${C.vol}${p.r}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(p.after)}</t></is></c>`;
  const rowNext = row.raw.replace(cell.raw, next);
  xml = xml.replace(row.raw, rowNext);
  row.raw = rowNext;
}
if (!fs.existsSync(BACKUP)) fs.copyFileSync(XLSX, BACKUP);
zip.updateFile(entry, Buffer.from(xml, "utf8"));
zip.writeZip(XLSX);
fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync(LOG, JSON.stringify({ plan, unmatched }, null, 1));
console.log(`반영 ${plan.length}셀 — 백업 ${BACKUP} · 기록 ${LOG}`);

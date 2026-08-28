// 법원간행물(대법원 판례해설) 시트에 「학습과목 판례」 열을 신설한다.
//
// 값: 있음 / 없음 / 삭제본만 — compare-haeseol-with-cases.mjs 와 같은 대조 규칙.
//
// ★쓰기는 시트 XML 직접 편집이다. xlsx-io 의 writeSheet 는 공유문자열을 비우고
//   sheet1 만 다시 쓰므로, 시트가 3개인 이 파일에는 쓸 수 없다(나머지 두 시트가 깨진다).
// ★기존 셀·서식·수식은 건드리지 않고 J 열만 덧붙인다.
//
// 사용:
//   node scripts/court-publications/mark-xlsx-case-coverage.mjs           # 예행
//   node scripts/court-publications/mark-xlsx-case-coverage.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const XLSX = "source/법원간행물/법원간행물(통합_list).xlsx";
const BACKUP = "source/법원간행물/법원간행물(통합_list).열추가전.xlsx";
const HEADER = "학습과목 판례";
const COL = "J";
const COL_INDEX = 10;

const unesc = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TOK = /(\d{2,4})\s*([가-힣]{1,3})\s*(\d+)/;
/** "97후860, 877, 884" → [97후860, 97후877, 97후884] */
function tokens(s) {
  if (!s) return [];
  const out = [];
  let year = null, kind = null;
  for (const p of s.split(/[,，·]/).map((x) => x.trim()).filter(Boolean)) {
    const m = TOK.exec(p);
    if (m) { year = m[1]; kind = m[2]; out.push(m[1] + m[2] + m[3]); }
    else if (/^\d+$/.test(p) && year) out.push(year + kind + p);
  }
  return out;
}

const zip = new AdmZip(XLSX);

// ── 대상 시트 찾기 ──────────────────────────────────────────────────────────
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
  unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")),
);
let xml = zip.readAsText(entry);

// 이미 열이 있으면 멈춘다 — 두 번 붙이면 J·K 로 갈라진다.
if (new RegExp(`<c r="${COL}\\d+"`).test(xml)) {
  console.error(`${COL} 열이 이미 있습니다. 먼저 지운 뒤 다시 실행하세요.`);
  process.exit(1);
}

// ── 행 파싱 ─────────────────────────────────────────────────────────────────
const rows = [...xml.matchAll(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g)].map((m) => {
  const cells = new Map();
  for (const c of m[3].matchAll(
    /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>|<c r="([A-Z]+)\d+"[^>]*\/>/g,
  )) {
    const ref = c[1] ?? c[5];
    let v = "";
    if (c[3] !== undefined) v = /t="s"/.test(c[2] ?? "") ? (shared[Number(c[3])] ?? "") : c[3];
    else if (c[4] !== undefined)
      v = unesc([...c[4].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
    cells.set(ref, v);
  }
  return { r: Number(m[1]), cells, raw: m[0] };
});
const header = rows.find((x) => x.r === 1);
const colOf = (name) => [...header.cells].find(([, v]) => v.trim() === name)?.[0];
const cCase = colOf("판례번호");
const cGubun = colOf("구분");
if (!cCase) throw new Error("판례번호 열을 찾지 못했습니다");

// ── DB 대조 ─────────────────────────────────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const cases = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("cases").select("case_id, case_number, deleted_at").order("case_id").range(from, from + 999);
  if (error) throw error;
  cases.push(...data);
  if (data.length < 1000) break;
}
const idx = new Map();
for (const c of cases)
  for (const t of tokens(c.case_number)) {
    const cur = idx.get(t);
    if (!cur || (cur.deleted_at && !c.deleted_at)) idx.set(t, c);
  }

const value = new Map([[1, HEADER]]);
const tally = new Map();
for (const row of rows) {
  if (row.r === 1) continue;
  const caseNo = (row.cells.get(cCase) ?? "").trim();
  const hit = tokens(caseNo).map((t) => idx.get(t)).find(Boolean) ?? null;
  const v = !caseNo ? "" : !hit ? "없음" : hit.deleted_at ? "삭제본만" : "있음";
  value.set(row.r, v);
  const g = (row.cells.get(cGubun) ?? "").trim() || "(빈칸)";
  const key = `${g} ${v || "(판례번호 없음)"}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
}
console.log(`${entry} — 데이터 ${rows.length - 1}행`);
for (const [k, v] of [...tally].sort()) console.log(`  ${k}: ${v}`);

if (!APPLY) {
  console.log("예행 — 반영하려면 --apply");
  process.exit(0);
}

// ── XML 편집 ────────────────────────────────────────────────────────────────
const lastRow = Math.max(...rows.map((x) => x.r));
for (const row of rows) {
  const cell =
    `<c r="${COL}${row.r}" t="inlineStr"><is><t xml:space="preserve">${esc(value.get(row.r) ?? "")}</t></is></c>`;
  const next = row.raw
    .replace(/^<row r="\d+"([^>]*)>/, (m2) => m2.replace(/spans="1:\d+"/, `spans="1:${COL_INDEX}"`))
    // ★필터 잔재로 숨겨진 행을 되살린다 — 새 열 값이 안 보이면 붙인 의미가 없다.
    .replace(/ hidden="1"/, "")
    .replace(/<\/row>$/, `${cell}</row>`);
  xml = xml.replace(row.raw, next);
}
xml = xml
  .replace(/<dimension ref="A1:[A-Z]+\d+"\/>/, `<dimension ref="A1:${COL}${lastRow}"/>`)
  .replace(/<sheetPr filterMode="1"\/>/, "<sheetPr/>")
  .replace(
    /<col min="9"[^/]*\/>/,
    (m2) => `${m2}<col min="${COL_INDEX}" max="${COL_INDEX}" width="14" customWidth="1"/>`,
  )
  // 열이 늘었으니 필터 범위도 넓히고, 아무 것도 걸리지 않는 낡은 조건은 지운다.
  .replace(
    /<autoFilter ref="[^"]*"([^>]*)>[\s\S]*?<\/autoFilter>|<autoFilter ref="[^"]*"([^>]*)\/>/,
    (_m, a, b) => `<autoFilter ref="A1:${COL}${lastRow}"${a ?? b ?? ""}/>`,
  );

if (!fs.existsSync(BACKUP)) fs.copyFileSync(XLSX, BACKUP);
zip.updateFile(entry, Buffer.from(xml, "utf8"));
zip.writeZip(XLSX);
console.log(`반영 완료 — ${COL} 열 "${HEADER}" 추가. 백업: ${BACKUP}`);

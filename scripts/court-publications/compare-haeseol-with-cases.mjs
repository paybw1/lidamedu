// 법원간행물(대법원 판례해설) 목록 ↔ 학습과목 판례(cases) 대조.
//
// 무엇을 답하나
//   ① 해설이 다루는 판결이 우리 DB 에 있는가 / 없는가
//   ② 있는 것 중, 그 해설이 판례 화면의 「관련논문·기사」(case_references)에 등록돼 있는가
//
// ★사건번호는 "97후860, 877, 884" 처럼 뒤 번호가 앞의 연도·부호를 물려받는 표기가 있다.
//   토큰화에서 이를 풀지 않으면 멀쩡한 판례를 "없음"으로 오판한다.
// ★같은 사건번호가 soft-delete 행과 살아있는 행으로 둘 다 있는 경우가 있어(19건 중복)
//   살아있는 행을 우선한다. 삭제본만 있으면 "없음"으로 본다(학생에게 안 보이므로).
//
// 사용:
//   node scripts/court-publications/compare-haeseol-with-cases.mjs           # 구분=특
//   node scripts/court-publications/compare-haeseol-with-cases.mjs --gubun 상
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const GUBUN = argv.includes("--gubun") ? argv[argv.indexOf("--gubun") + 1] : "특";
const XLSX = "source/법원간행물/법원간행물(통합_list).xlsx";
const OUT_DIR = "tmp";

// ── xlsx 최소 읽기 (xlsx-io.ts 와 같은 규칙, mjs 용) ────────────────────────
const unesc = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function readSheetByName(zip, needle) {
  const wb = zip.readAsText("xl/workbook.xml");
  const rels = zip.readAsText("xl/_rels/workbook.xml.rels");
  const target = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g))
    target.set(m[1], `xl/${m[2].replace(/^\//, "")}`);
  let entry = null;
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g))
    if (m[1].includes(needle)) entry = target.get(m[2]);
  if (!entry) throw new Error(`시트 없음: ${needle}`);
  const ss = zip.readAsText("xl/sharedStrings.xml");
  const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")),
  );
  const sheet = zip.readAsText(entry);
  const rows = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(
      /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>|<c r="([A-Z]+)\d+"[^>]*\/>/g,
    )) {
      const ref = c[1] ?? c[5];
      let i = 0;
      for (const ch of ref) i = i * 26 + (ch.charCodeAt(0) - 64);
      i -= 1;
      let v = "";
      if (c[3] !== undefined) v = /t="s"/.test(c[2] ?? "") ? (shared[Number(c[3])] ?? "") : c[3];
      else if (c[4] !== undefined)
        v = unesc([...c[4].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      row[i] = v;
    }
    rows.push([...row].map((v) => v ?? ""));
  }
  return rows;
}

/** "97후860, 877, 884" → [97후860, 97후877, 97후884] */
const TOK = /(\d{2,4})\s*([가-힣]{1,3})\s*(\d+)/;
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

/**
 * 그 행의 해설이 이미 등록돼 있나.
 * ★"판례해설" 글자만 보면 안 된다 — 2005후1202 에는 「대법원 판례해설 53호」가 붙어 있지만
 *   그 판결(2007년 선고)의 해설은 70호다. 호수가 다르면 다른 글이므로 미등록으로 센다.
 */
const volOf = (s) => Number(/([0-9]+)\s*호/.exec(s ?? "")?.[1] ?? NaN);
function hasThisHaeseol(refs, vol) {
  const want = volOf(vol);
  return refs.some((r) => {
    const text = (r.title ?? "") + (r.source ?? "");
    if (!/판례해설/.test(text)) return false;
    const got = volOf(text);
    return Number.isNaN(want) || Number.isNaN(got) || got === want;
  });
}

// ── 목록 ────────────────────────────────────────────────────────────────────
const rows = readSheetByName(new AdmZip(XLSX), "판례해설");
const H = rows[0];
const col = (n) => H.findIndex((h) => h.trim() === n);
const C = {
  no: col("번호"), g: col("구분"), t: col("논문 제목"), a: col("저자"),
  n: col("판례번호"), d: col("선고일"), v: col("권호"), p: col("발간년도"),
};
const items = rows.slice(1)
  .filter((r) => (r[C.g] ?? "").trim() === GUBUN)
  .map((r) => ({
    no: Number(r[C.no]), title: (r[C.t] ?? "").trim(), author: (r[C.a] ?? "").trim(),
    caseNo: (r[C.n] ?? "").trim(), decided: (r[C.d] ?? "").trim(),
    vol: (r[C.v] ?? "").trim(), pub: (r[C.p] ?? "").trim(),
  }));

// ── DB ──────────────────────────────────────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const cases = await pageAll(() =>
  sb.from("cases")
    .select("case_id, case_number, case_title, subject_laws, decided_at, deleted_at, list_visible")
    .order("case_id"),
);
const refs = await pageAll(() =>
  sb.from("case_references").select("case_id, kind, title, source, url").order("reference_id"),
);
const byCase = new Map();
for (const r of refs) {
  if (!byCase.has(r.case_id)) byCase.set(r.case_id, []);
  byCase.get(r.case_id).push(r);
}
const idx = new Map();
for (const c of cases)
  for (const t of tokens(c.case_number)) {
    const cur = idx.get(t);
    if (!cur || (cur.deleted_at && !c.deleted_at)) idx.set(t, c);
  }

const present = [], absent = [];
for (const it of items) {
  const hit = tokens(it.caseNo).map((t) => idx.get(t)).find(Boolean) ?? null;
  if (hit && !hit.deleted_at)
    present.push({ ...it, hit, refs: byCase.get(hit.case_id) ?? [] });
  else absent.push({ ...it, deletedOnly: Boolean(hit) });
}
const noHaeseol = present.filter((p) => !hasThisHaeseol(p.refs, p.vol));

// ── 출력 ────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
const stem = path.join(OUT_DIR, `haeseol-${GUBUN}-vs-cases`);
fs.writeFileSync(`${stem}.json`, JSON.stringify({ present, absent }, null, 1));

const csv = [
  "구분,해설번호,판례번호,선고일,권호,논문제목,저자,DB수록,case_id,과목,관련논문기사_해설등록,참고문헌수",
  ...items.map((it) => {
    const p = present.find((x) => x.no === it.no);
    const a = absent.find((x) => x.no === it.no);
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    return [
      GUBUN, it.no, q(it.caseNo), q(it.decided), q(it.vol), q(it.title), q(it.author),
      p ? "있음" : a?.deletedOnly ? "삭제본만" : "없음",
      p?.hit.case_id ?? "", q(p ? String(p.hit.subject_laws) : ""),
      p ? (hasThisHaeseol(p.refs, p.vol) ? "등록" : "미등록") : "",
      p ? p.refs.length : "",
    ].join(",");
  }),
].join("\n");
fs.writeFileSync(`${stem}.csv`, "\ufeff" + csv);

console.log(`구분=${GUBUN} ${items.length}건`);
console.log(`  DB 있음 ${present.length} / 없음 ${absent.length} (삭제본만 ${absent.filter((a) => a.deletedOnly).length})`);
console.log(`  있음 중 해설 미등록 ${noHaeseol.length} · 참고문헌 0건 ${present.filter((p) => p.refs.length === 0).length}`);
console.log(`  → ${stem}.csv / .json`);

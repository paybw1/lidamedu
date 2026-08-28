// 판례해설 참고문헌의 권호·면수를 「대법원판례해설 총목록(분야별)」로 바로잡는다.
//
// 왜: 통합 목록 xlsx 의 권호 열이 틀린 곳이 있다(2006~2007년 구간에서 1~3호 밀림).
//     법원도서관 총목록은 권호·면수·발간년도를 함께 싣고, 해설 PDF 의 인쇄 쪽번호와도
//     맞아떨어진다(예: 2004도4420 → 65호 443면, PDF 첫 쪽이 443). 총목록을 권위로 삼는다.
//
// ★제목으로 짝짓는다 — 사건번호는 총목록에 없다. 앞부분이 12자 이상 겹치고 저자가 같은
//   것을 우선한다. 짝을 못 찾으면 손대지 않고 목록으로 남긴다.
//
// 사용:
//   node scripts/court-publications/fix-haeseol-volumes.mjs           # 예행
//   node scripts/court-publications/fix-haeseol-volumes.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import * as mupdf from "mupdf";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const TOC_PDF = "source/법원간행물/category_146.pdf";
/** 총목록 안에서 지식재산권 분야가 실린 쪽 범위(쪽머리로 확인). */
const TOC_FROM = 305, TOC_TO = 338;
const GUBUNS = ["특", "상", "디", "부", "저", "기", "발"];
const BACKUP = "tmp/haeseol-volume-fix-backup.json";

const clean = (t) =>
  (t ?? "")
    .replace(/^\s*지식재산권\s*\d+\s*/, "")
    .replace(/\s+\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*선고[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
// ★구두점은 전부 버린다 — 목록과 총목록이 같은 자리를 ㆍ / _ / ? 로 제각각 쓴다
//   ("상품 출처의 오인_혼동" vs "오인ㆍ혼동", "수입?판매" vs "수입ㆍ판매").
const norm = (s) =>
  clean(s).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();

// ── 총목록 파싱 ─────────────────────────────────────────────────────────────
const doc = mupdf.Document.openDocument(fs.readFileSync(TOC_PDF), "application/pdf");
const AUTHOR_YEAR = /^(.*?)((?:19|20)\d{2}년(?:\s*[상하])?)$/;
const VOL = /^(\d+)호$/;
const toc = [];
{
  let vol = null, title = [];
  for (let p = TOC_FROM; p <= TOC_TO; p++) {
    const st = JSON.parse(doc.loadPage(p - 1).toStructuredText().asJSON());
    const lines = [];
    for (const b of st.blocks ?? []) for (const l of b.lines ?? []) if ((l.text ?? "").trim()) lines.push(l.text.trim());
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i].replace(/^지식재산권\s*[^\s\d]?\s*\d+\s*/, "").trim();
      if (!l || /총목록\(분야별\)|^권호$|^논 ?제$|^저 ?자$|^발간년도$|^면수$/.test(l)) continue;
      const v = VOL.exec(l);
      if (v) { vol = Number(v[1]); continue; }
      const m = AUTHOR_YEAR.exec(l);
      if (m && title.length) {
        toc.push({
          vol, page: Number((lines[i + 1] ?? "").replace(/[^\d]/g, "")),
          title: title.join(" ").replace(/\s+/g, " ").trim(), author: m[1].trim(), pub: m[2].trim(),
        });
        title = []; i += 1; continue;
      }
      title.push(l);
    }
  }
}
console.log(`총목록 지식재산권 ${toc.length}건 (권호 ${Math.min(...toc.map((t) => t.vol))}~${Math.max(...toc.map((t) => t.vol))})`);
const tocIdx = toc.map((e) => ({ e, key: norm(e.title) }));

function findToc(title, author) {
  const k = norm(title);
  let best = null, score = 0;
  for (const { e, key } of tocIdx) {
    if (!key || !k) continue;
    const [short, long] = key.length < k.length ? [key, k] : [k, key];
    if (!long.startsWith(short) || short.length < 8) continue;
    // ★짧은 제목("도형상표의 유사")은 저자까지 같아야 인정한다 — 같은 논제가 여러 호에 있다.
    const sameAuthor = norm(e.author) === norm(author);
    if (short.length < 12 && !sameAuthor) continue;
    const s = short.length + (sameAuthor ? 100 : 0);
    if (s > score) { best = e; score = s; }
  }
  return best;
}

// ── xlsx 대조분(compare 산출물) ─────────────────────────────────────────────
const rows = [];
for (const g of GUBUNS) {
  const f = `tmp/haeseol-${g}-vs-cases.json`;
  if (!fs.existsSync(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).present) rows.push({ ...p, gubun: g });
}
const rowByKey = new Map();
for (const r of rows) rowByKey.set(`${r.hit.case_id}|${clean(r.title)}`, r);

// ── 참고문헌 ────────────────────────────────────────────────────────────────
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const refs = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("case_references")
    .select("reference_id, case_id, title, authors, source").order("reference_id").range(f, f + 999);
  if (error) throw error;
  refs.push(...data);
  if (data.length < 1000) break;
}
const mine = refs.filter((r) => /^대법원 판례해설/.test(r.source ?? ""));
console.log(`판례해설 참고문헌(이번 형식) ${mine.length}건`);

const plan = [], unmatched = [];
for (const r of mine) {
  const row = rowByKey.get(`${r.case_id}|${(r.title ?? "").trim()}`);
  if (!row) { unmatched.push({ ...r, why: "목록 행 못 찾음" }); continue; }
  const e = findToc(row.title, row.author);
  if (!e) { unmatched.push({ ...r, why: "총목록에 없음" }); continue; }
  const source = `대법원 판례해설 ${e.vol}호 ${e.page}면 (${e.pub})`;
  if (source === r.source) continue;
  plan.push({ reference_id: r.reference_id, caseNo: row.hit.case_number, before: r.source, after: source, xlsxVol: row.vol, tocVol: `${e.vol}호` });
}
console.log(`바꿀 것 ${plan.length} · 그대로 ${mine.length - plan.length - unmatched.length} · 짝 없음 ${unmatched.length}`);
const volChanged = plan.filter((x) => Number(/(\d+)/.exec(x.xlsxVol)?.[1]) !== Number(/(\d+)/.exec(x.tocVol)[1]));
console.log(`  그중 권호가 실제로 달라진 것 ${volChanged.length}`);
for (const x of volChanged) console.log(`   ${x.caseNo}: ${x.xlsxVol} → ${x.tocVol}`);
for (const u of unmatched) console.log(`  [보류] ${u.why} — ${u.source} | ${(u.title ?? "").slice(0, 40)}`);

if (!APPLY) {
  for (const x of plan.slice(0, 3)) console.log(`  예시 ${x.caseNo}: "${x.before}" → "${x.after}"`);
  console.log("예행 — 반영하려면 --apply");
  process.exit(0);
}
fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify(plan, null, 1));
let done = 0;
for (const x of plan) {
  const { error } = await sb.from("case_references").update({ source: x.after }).eq("reference_id", x.reference_id);
  if (error) { console.error(`실패 ${x.caseNo}:`, error.message); continue; }
  done++;
}
console.log(`반영 ${done}/${plan.length} — 되돌림용 ${BACKUP}`);

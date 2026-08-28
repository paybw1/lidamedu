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
import { createClient } from "@supabase/supabase-js";

import { cleanTitle as clean, makeFinder, parseToc } from "./lib-haeseol-toc.mjs";

const APPLY = process.argv.includes("--apply");
const GUBUNS = ["특", "상", "디", "부", "저", "기", "발"];
const BACKUP = "tmp/haeseol-volume-fix-backup.json";

const toc = parseToc();
const findToc = makeFinder(toc);
console.log(`총목록 지식재산권 ${toc.length}건 (권호 ${toc.at(-1)?.vol}~${toc[0]?.vol})`);

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
  // 총목록에서 발간반기를 못 읽은 항목이 몇 있다 — 그럴 땐 지금 값을 지키고 덮지 않는다.
  const pub = e.pub || /\(([^)]+)\)\s*$/.exec(r.source ?? "")?.[1] || row.pub || "";
  const source = `대법원 판례해설 ${e.vol}호 ${e.page}면${pub ? ` (${pub})` : ""}`;
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

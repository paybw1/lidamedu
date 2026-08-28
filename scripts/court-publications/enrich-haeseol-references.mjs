// 옛 형식 판례해설 참고문헌에 제목·저자를 채운다.
//
// 상표 교재 적재 때 들어온 것들은 제목 자리에 서지사항만 있다.
//   before  제목 "대법원 판례해설 53호 264면" · 저자 없음 · 출처 없음
//   after   제목 "소취하 합의의 묵시적 합의해제" · 저자 정태학
//           출처 "대법원 판례해설 53호 264면 (2003년 상)"   ← 면수는 살린다
//
// ★호수가 숫자로 정확히 일치할 때만 손댄다 — 목록과 다른 글을 덮어쓰면 되돌릴 수 없다.
// ★멱등 — 이미 보강된 것(제목이 서지사항 형태가 아님)은 건너뛴다.
//
// 사용:
//   node scripts/court-publications/enrich-haeseol-references.mjs           # 예행
//   node scripts/court-publications/enrich-haeseol-references.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const GUBUNS = ["특", "상", "디", "부", "저", "기", "발"];
const BACKUP = "tmp/haeseol-enrich-backup.json";
/** 제목이 서지사항뿐인 옛 형식. 이 꼴일 때만 제목을 바꾼다. */
const OLD_TITLE = /^대법원\s*판례해설\s*\d+\s*호(\s*\d+\s*면)?\s*$/;
const volOf = (s) => Number(/([0-9]+)\s*호/.exec(s ?? "")?.[1] ?? NaN);
const pageOf = (s) => /(\d+\s*면)/.exec(s ?? "")?.[1]?.replace(/\s+/g, "") ?? null;

/** 목록 제목의 편집 흔적 제거 — insert-haeseol-references 와 같은 규칙. */
const cleanTitle = (t) =>
  t
    .replace(/^\s*지식재산권\s*\d+\s*/, "")
    .replace(/\s+\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*선고[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const rows = [];
for (const g of GUBUNS) {
  const f = `tmp/haeseol-${g}-vs-cases.json`;
  if (!fs.existsSync(f)) { console.log(`(건너뜀) ${f} 없음 — compare 를 먼저 돌리세요`); continue; }
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).present) rows.push({ ...p, gubun: g });
}
console.log(`목록 대조분 ${rows.length}행`);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const refs = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb
    .from("case_references")
    .select("reference_id, case_id, kind, title, authors, source")
    .order("reference_id").range(f, f + 999);
  if (error) throw error;
  refs.push(...data);
  if (data.length < 1000) break;
}
const byCase = new Map();
for (const r of refs) {
  if (!byCase.has(r.case_id)) byCase.set(r.case_id, []);
  byCase.get(r.case_id).push(r);
}

const plan = [], loose = [];
for (const p of rows) {
  const want = volOf(p.vol);
  if (Number.isNaN(want)) continue;
  for (const r of byCase.get(p.hit.case_id) ?? []) {
    if (!OLD_TITLE.test((r.title ?? "").trim())) continue;
    const got = volOf(r.title);
    if (got !== want) continue;
    const page = pageOf(r.title);
    plan.push({
      reference_id: r.reference_id,
      caseNo: p.hit.case_number,
      before: { title: r.title, authors: r.authors, source: r.source },
      after: {
        title: cleanTitle(p.title),
        authors: p.author || null,
        source: `대법원 판례해설 ${p.vol}${page ? ` ${page}` : ""}${p.pub ? ` (${p.pub})` : ""}`,
      },
    });
  }
}
// 목록에서 짝을 못 찾은 옛 형식 — 사람이 봐야 한다.
const planned = new Set(plan.map((x) => x.reference_id));
for (const r of refs)
  if (OLD_TITLE.test((r.title ?? "").trim()) && !planned.has(r.reference_id)) loose.push(r);

console.log(`보강 대상 ${plan.length} · 목록에 짝 없는 옛 형식 ${loose.length}`);
for (const r of loose.slice(0, 20)) console.log(`  [보류] ${r.title}`);
if (!APPLY) {
  for (const x of plan.slice(0, 3))
    console.log(`  예시 ${x.caseNo}: "${x.before.title}" → "${x.after.title}" / ${x.after.authors} · ${x.after.source}`);
  console.log("예행 — 반영하려면 --apply");
  process.exit(0);
}

fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync(BACKUP, JSON.stringify(plan, null, 1));
let done = 0;
for (const x of plan) {
  const { error } = await sb.from("case_references").update(x.after).eq("reference_id", x.reference_id);
  if (error) { console.error(`실패 ${x.caseNo}:`, error.message); continue; }
  done++;
}
console.log(`보강 완료 ${done}/${plan.length} — 되돌림용 백업 ${BACKUP}`);

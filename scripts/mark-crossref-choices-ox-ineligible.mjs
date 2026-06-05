// 예상문제 지문(problem_choices) 중 "다른 지문 교차참조"(①②③④⑤ 로 다른 선지를
// 가리킴: "②의 경우", "위 ③", "① 내지 ④" 등)를 OX 불가로 표시.
// 교차참조 지문은 단독 진위(OX)로 성립하지 않는다.
//
// 조문 인용(法 42의2②, 제42조②)의 원문자는 제외 — 원문자 바로 앞이 숫자/조/항이면 인용.
// 이미 ox_ineligible 인 것(예: mc_box 지문)은 건너뜀.
//
//   node scripts/mark-crossref-choices-ox-ineligible.mjs            # dry-run
//   node scripts/mark-crossref-choices-ox-ineligible.mjs --apply

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
console.log(`proj: ${process.env.SUPABASE_URL}`);

const CIRCLED = "①②③④⑤";
// 원문자가 조문 인용인가 — 바로 앞 글자가 숫자, 또는 직전이 조/항(제42조②).
function isCitation(body, k) {
  const prev = body[k - 1] ?? "";
  if (/[0-9]/.test(prev)) return true;
  if (/[조항條]$/.test(body.slice(0, k))) return true;
  return false;
}
// 교차참조 원문자(인용이 아닌 ①~⑤)가 1개라도 있으면 cross-ref 지문.
function crossRefMarkers(body) {
  const out = [];
  for (let k = 0; k < body.length; k++) {
    if (!CIRCLED.includes(body[k])) continue;
    if (isCitation(body, k)) continue;
    out.push({ k, ctx: body.slice(Math.max(0, k - 8), k + 8).replace(/\n/g, " ") });
  }
  return out;
}

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await supa.from("problems")
  .select("problem_id, format")
  .eq("law_id", law.law_id).eq("origin", "expected").is("deleted_at", null);
const fmt = new Map(probs.map((p) => [p.problem_id, p.format]));
const ids = probs.map((p) => p.problem_id);

const rows = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa.from("problem_choices")
    .select("choice_id, problem_id, choice_index, body_md, ox_ineligible")
    .in("problem_id", ids.slice(i, i + 100));
  rows.push(...(data ?? []));
}

const flag = [];        // 교차참조 → 마킹 대상(이미 inel 제외)
const alreadyInel = []; // 교차참조지만 이미 inel
const citationOnly = []; // 원문자 있으나 인용뿐 → 마킹 안 함(검증용)
for (const r of rows) {
  if (![...r.body_md].some((c) => CIRCLED.includes(c))) continue;
  const refs = crossRefMarkers(r.body_md);
  if (refs.length === 0) { citationOnly.push(r); continue; }
  if (r.ox_ineligible === true) { alreadyInel.push(r); continue; }
  flag.push({ ...r, refs });
}

console.log(`\n=== 마킹 대상(교차참조, 현재 eligible) ${flag.length}건 ===`);
for (const f of flag) {
  console.log(`  [${fmt.get(f.problem_id)}] idx=${f.choice_index} | ${f.refs.map((x) => JSON.stringify(x.ctx)).join("  ")}`);
}
console.log(`\n=== 교차참조지만 이미 OX불가(건너뜀) ${alreadyInel.length}건 (대부분 mc_box) ===`);
const byFmtA = {};
for (const r of alreadyInel) byFmtA[fmt.get(r.problem_id)] = (byFmtA[fmt.get(r.problem_id)] || 0) + 1;
console.log("  " + JSON.stringify(byFmtA));
console.log(`\n=== 원문자 있으나 '조문 인용'뿐 → 마킹 안 함 ${citationOnly.length}건 (검증) ===`);
for (const r of citationOnly) console.log(`  [${fmt.get(r.problem_id)}] idx=${r.choice_index} | ${JSON.stringify(r.body_md.slice(0, 80))}`);

if (!APPLY) { console.log(`\n(dry-run — --apply 로 실행)`); process.exit(0); }

console.log(`\n=== APPLY ===`);
let ok = 0;
const idList = flag.map((f) => f.choice_id);
for (let i = 0; i < idList.length; i += 100) {
  const slice = idList.slice(i, i + 100);
  const { error } = await supa.from("problem_choices")
    .update({ ox_ineligible: true }).in("choice_id", slice);
  if (error) { console.error("update 실패:", error.message); process.exit(1); }
  ok += slice.length;
}
console.log(`완료 — ${ok}건 OX불가 처리`);

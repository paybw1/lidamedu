// 기출 지문에 책 말미 back-matter(저자소개·저서목록·판권)가 표째 붙은 오염 정리.
// 마지막 문제 파싱 시 뒤따르는 colophon 이 지문에 흡수된 케이스.
// "저｜자｜소｜개"(저자소개, 전각 | 로 자간 벌어짐) 마커 이후를 잘라낸다.
//
//   node scripts/clean-exam-backmatter-choices.mjs            # dry-run
//   node scripts/clean-exam-backmatter-choices.mjs --apply

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log(`proj: ${process.env.SUPABASE_URL}`);

const MARK = "저｜자｜소｜개"; // 저자소개

const { data: probs } = await (async () => {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from("problems").select("problem_id, origin").is("deleted_at", null).range(from, from + 999);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: all };
})();
const ids = probs.map((p) => p.problem_id);

const targets = [];
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await supa.from("problem_choices").select("choice_id, problem_id, choice_index, body_md").in("problem_id", ids.slice(i, i + 200));
  for (const c of data ?? []) {
    if (!c.body_md.includes(MARK)) continue;
    const cleaned = c.body_md.split(MARK)[0].trim();
    if (cleaned && cleaned !== c.body_md) targets.push({ choice_id: c.choice_id, problem_id: c.problem_id, idx: c.choice_index, oldLen: c.body_md.length, new: cleaned });
  }
}

console.log(`\n=== back-matter 오염 지문 ${targets.length}건 ===`);
for (const t of targets) console.log(`  ${t.problem_id} 지문${t.idx}  ${t.oldLen}자 → ${t.new.length}자\n     ${JSON.stringify(t.new)}`);

if (!APPLY) { console.log(`\n(dry-run — --apply 로 실행)`); process.exit(0); }
let ok = 0;
for (const t of targets) {
  const { error } = await supa.from("problem_choices").update({ body_md: t.new }).eq("choice_id", t.choice_id);
  if (error) console.error(`  실패 ${t.choice_id}: ${error.message}`); else ok++;
}
console.log(`완료 — ${ok}/${targets.length}`);

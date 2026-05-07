// 보강된 정규식으로 choice_type IS NULL 인 problem_choices 만 일회성 재분류.
//
// 보강 포인트:
//  - statute: "특허법 제29조" 외에 "제29조 제2항", "법 제\d+조" 도 포함.
//  - precedent: "대법원 2013도10265" 같은 사건번호 직접 표기, "특허법원 2008.6.26" 같은 변형 포함.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 보강된 정규식.
const STATUTE_RE =
  /法\s*\d+|특허법\s*제\s*\d+\s*조|법\s*제\s*\d+\s*조|시행령\s*제\s*\d+\s*조|시행규칙|발진법|제\s*\d+\s*조\s*제\s*\d+\s*항|^제\s*\d+\s*조/;
const PRECEDENT_RE =
  /대법원\s*\d{4}|헌법재판소|헌재\s*\d{4}|특허법원\s*\d{4}|선고\s*\d{2,4}\s*[다후카허]\s*\d+|\d{4}\s*[도후카허]\s*\d+|\d{2,4}\.\s*\d+\.\s*\d+\s*선고/;

function classify(text) {
  if (!text) return null;
  if (PRECEDENT_RE.test(text)) return "precedent";
  if (STATUTE_RE.test(text)) return "statute";
  return "theory";
}

const { data: rows, error } = await supa
  .from("problem_choices")
  .select("choice_id, problem_id, choice_index, body_md, explanation_md")
  .is("choice_type", null);
if (error) { console.error(error); process.exit(1); }

console.log(`미분류 후보: ${rows?.length ?? 0}`);

let stat = { statute: 0, precedent: 0, theory: 0, kept_null: 0 };
const updates = [];
for (const r of rows ?? []) {
  // 분류 입력은 explanation_md 우선, 없으면 body_md.
  const text = (r.explanation_md ?? "").trim() || r.body_md;
  const t = classify(text);
  if (!t) { stat.kept_null++; continue; }
  stat[t]++;
  updates.push({ choice_id: r.choice_id, choice_type: t });
}
console.log(`분류 결과: ${JSON.stringify(stat)}`);

// 적용 — 1건씩 update (양이 적어 batch 불필요).
let applied = 0;
for (const u of updates) {
  const { error: e } = await supa
    .from("problem_choices")
    .update({ choice_type: u.choice_type })
    .eq("choice_id", u.choice_id);
  if (e) console.error(`  실패 ${u.choice_id}: ${e.message}`);
  else applied++;
}
console.log(`✓ ${applied} / ${updates.length} 적용`);

// 13건 정렬 불일치(recover-expected-truncated-choices 의 prefix-아님) 포렌식.
// 각 mismatch 문제에 대해 DB 지문 vs 문제편 원본 paragraph 블록을 나란히 출력.
//
//   node scripts/diag/investigate-expected-mismatches.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
console.log(`proj: ${process.env.SUPABASE_URL}\n`);

const merged = JSON.parse(readFileSync("source/_converted/expected-merged.json", "utf8"));
const rawDoc = JSON.parse(readFileSync("source/_converted/expected-problems.json", "utf8"));
const paras = rawDoc.paragraphs ?? [];

const norm = (s) => (s ?? "").replace(/\s+/g, "").slice(0, 200);
const normBody = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const stripMarker = (s) => (s ?? "").replace(/^\s*[①②③④⑤]\s*/, "");
const bodyMatches = (a, b) => {
  const x = normBody(a), y = normBody(b);
  return x === y || y.startsWith(x) || x.startsWith(y);
};

// candidatesByKey (recover 와 동일).
const candidatesByKey = new Map();
for (const p of merged.problems) {
  if (!p.choices?.length) continue;
  const k = norm(p.stem);
  if (!k) continue;
  if (!candidatesByKey.has(k)) candidatesByKey.set(k, []);
  candidatesByKey.get(k).push(p);
}

// DB 데이터.
const { data: lawRow } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: dbProbs } = await supa.from("problems")
  .select("problem_id, body_md, problem_number")
  .eq("law_id", lawRow.law_id).eq("origin", "expected").is("deleted_at", null)
  .order("problem_id");
const ids = dbProbs.map((p) => p.problem_id);
const choicesByProblem = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa.from("problem_choices")
    .select("choice_id, problem_id, choice_index, body_md, ox_ineligible")
    .in("problem_id", ids.slice(i, i + 100));
  for (const r of data ?? []) {
    if (!choicesByProblem.has(r.problem_id)) choicesByProblem.set(r.problem_id, []);
    choicesByProblem.get(r.problem_id).push(r);
  }
}

// 원본 choice-block 찾기: dbChoices 중 가장 긴 것의 핵심 조각이 들어있는
// 원본 paragraph 를 찾고, 그 주변 ①~⑤ paragraph 를 수집.
function findSourceBlock(dbChoices) {
  const sorted = [...dbChoices].sort((a, b) => b.body_md.length - a.body_md.length);
  for (const probe of sorted) {
    const needle = normBody(stripMarker(probe.body_md)).slice(0, 18).replace(/\s+/g, "");
    if (needle.length < 8) continue;
    for (let i = 0; i < paras.length; i++) {
      const t = normBody(paras[i].text).replace(/\s+/g, "");
      if (!t.includes(needle)) continue;
      // i 주변에서 ①~⑤ 로 시작하는 연속 paragraph 수집 (앞뒤로 탐색).
      let start = i;
      while (start > 0 && /^\s*[①②③④⑤]/.test(paras[start - 1].text ?? "")) start--;
      const block = [];
      for (let j = start; j < paras.length && block.length < 6; j++) {
        const tx = paras[j].text ?? "";
        if (/^\s*[①②③④⑤]/.test(tx)) block.push(tx.trim());
        else if (block.length > 0) break;
      }
      if (block.length >= 2) return block;
    }
  }
  return null;
}

// mismatch 문제 수집.
const seen = new Set();
let count = 0;
for (const dp of dbProbs) {
  const cands = candidatesByKey.get(norm(dp.body_md));
  if (!cands) continue;
  const dbChoices = (choicesByProblem.get(dp.problem_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
  let target = cands[0], best = -1;
  if (cands.length > 1) {
    for (const c of cands) {
      let s = 0;
      for (const cc of c.choices) {
        const db = dbChoices.find((d) => d.choice_index === cc.index);
        if (db && bodyMatches(db.body_md, cc.body)) s++;
      }
      if (s > best) { best = s; target = c; }
    }
  }
  const mism = dbChoices.filter((db) => {
    const pc = target.choices.find((c) => c.index === db.choice_index);
    if (!pc) return false;
    const a = normBody(db.body_md), b = normBody(pc.body);
    return a !== b && !b.startsWith(a); // exact 도 prefix 도 아님
  });
  if (mism.length === 0 || seen.has(dp.problem_id)) continue;
  seen.add(dp.problem_id);
  count++;

  console.log(`\n${"=".repeat(78)}`);
  console.log(`[${count}] problem_id=${dp.problem_id}  #${dp.problem_number}`);
  console.log(`stem: ${dp.body_md}`);
  console.log(`-- DB 지문 --`);
  for (const c of dbChoices)
    console.log(`  ${c.choice_index}${c.ox_ineligible ? "🚫" : "  "} (${c.body_md.length}자) ${JSON.stringify(c.body_md)}`);
  const block = findSourceBlock(dbChoices);
  console.log(`-- 문제편 원본 paragraph --`);
  if (block) for (const b of block) console.log(`  ${JSON.stringify(b)}`);
  else console.log(`  (원본 블록 못 찾음)`);
}
console.log(`\n\n총 mismatch 문제: ${count}건`);

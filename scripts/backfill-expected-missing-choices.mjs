// parse-problems.mjs 결함 fix 후 누락된 expected choice row 만 보충.
//
// 정책:
//   - 정상 row 는 절대 건드리지 않는다 — body / type / OX 보정·수기 편집 보존.
//   - parsed expected-merged.json 과 DB expected problems 를 stem 첫 80자(공백제거)
//     prefix 로 매칭.
//   - 각 매칭 쌍에서 parsed.choices.index 중 DB problem_choices.choice_index 에
//     없는 것만 INSERT — body / is_correct / explanation_md.
//   - choice_type / related_article_id 등은 NULL (운영자/backfill-expected-links
//     로 후속 처리).
//
// 사용:
//   node scripts/backfill-expected-missing-choices.mjs --dry-run
//   node scripts/backfill-expected-missing-choices.mjs --apply

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const merged = JSON.parse(
  readFileSync("source/_converted/expected-merged.json", "utf8"),
);
const parsedProblems = merged.problems ?? merged;

// 매칭 키 — stem 공백 제거 후 200자. 짧은 stem("다음 설명 중 옳지 않은 것은?"
// 28자) 도 그대로 들어가지만, parsed 와 DB body_md 가 같으면 1:1 매칭. 짧은
// stem 중복이 있으면 fallback 으로 problem_number + choices.body 까지 비교.
const norm = (s) => (s ?? "").replace(/\s+/g, "").slice(0, 200);

// 1) parsed problems 인덱싱 — norm(stem) → unique parsed 또는 ambiguous 그룹.
const parsedByKey = new Map();
const ambiguousGroup = new Map(); // key → parsed[] (같은 stem 짧은 발문 그룹)
for (const p of parsedProblems) {
  if (!p.choices || p.choices.length === 0) continue;
  const key = norm(p.stem);
  if (!key) continue;
  if (parsedByKey.has(key)) {
    const prev = parsedByKey.get(key);
    if (prev === "AMBIGUOUS") {
      ambiguousGroup.get(key).push(p);
    } else {
      parsedByKey.set(key, "AMBIGUOUS");
      ambiguousGroup.set(key, [prev, p]);
    }
    continue;
  }
  parsedByKey.set(key, p);
}

// 2) DB expected problems + choices 조회.
const { data: lawRow } = await supa
  .from("laws").select("law_id").eq("law_code", "patent").single();
const { data: dbProbs } = await supa
  .from("problems")
  .select("problem_id, body_md, problem_number")
  .eq("law_id", lawRow.law_id)
  .eq("origin", "expected")
  .is("deleted_at", null);

const problemIds = (dbProbs ?? []).map((p) => p.problem_id);
const CHUNK = 100;
const allChoices = [];
for (let i = 0; i < problemIds.length; i += CHUNK) {
  const ids = problemIds.slice(i, i + CHUNK);
  const { data: rows } = await supa
    .from("problem_choices")
    .select("problem_id, choice_index")
    .in("problem_id", ids);
  if (rows) allChoices.push(...rows);
}
const choiceIdxByProblem = new Map();
for (const c of allChoices) {
  if (!choiceIdxByProblem.has(c.problem_id))
    choiceIdxByProblem.set(c.problem_id, new Set());
  choiceIdxByProblem.get(c.problem_id).add(c.choice_index);
}

// 2.5) ambiguous fallback 매칭 위해 DB choices.body_md 도 같이 가져옴.
const dbChoiceBodyByProblem = new Map(); // problem_id → { index → body }
for (let i = 0; i < problemIds.length; i += CHUNK) {
  const ids = problemIds.slice(i, i + CHUNK);
  const { data: rows } = await supa
    .from("problem_choices")
    .select("problem_id, choice_index, body_md")
    .in("problem_id", ids);
  for (const r of rows ?? []) {
    if (!dbChoiceBodyByProblem.has(r.problem_id))
      dbChoiceBodyByProblem.set(r.problem_id, new Map());
    dbChoiceBodyByProblem.get(r.problem_id).set(r.choice_index, r.body_md);
  }
}

// 3) 매칭 + 누락 추출.
let matched = 0;
let noMatch = 0;
let ambiguous = 0;
let ambResolved = 0;
const inserts = []; // {problem_id, choice_index, body_md, is_correct, explanation_md, _label}
// ambiguous group 의 parsed entry 가 이미 매칭에 사용됐는지 추적 (중복 매칭 방지).
const usedParsedKeys = new Set(); // `${key}:${chapter}:${problemNumber}`
for (const dp of dbProbs) {
  const key = norm(dp.body_md);
  const ent = parsedByKey.get(key);
  if (!ent) { noMatch++; continue; }
  let target = ent;
  if (ent === "AMBIGUOUS") {
    // fallback — 같은 key 의 parsed 후보들 중 DB choices.body 와 가장 많이 겹치는 것 선택.
    const candidates = ambiguousGroup.get(key) ?? [];
    const dbBodies = dbChoiceBodyByProblem.get(dp.problem_id) ?? new Map();
    let best = null;
    let bestScore = 0;
    for (const cand of candidates) {
      const candKey = `${key}:${cand.chapter}:${cand.problemNumber}`;
      if (usedParsedKeys.has(candKey)) continue;
      let score = 0;
      for (const c of cand.choices) {
        const db = dbBodies.get(c.index);
        if (db && norm(db) === norm(c.body)) score++;
      }
      if (score > bestScore) { best = { cand, candKey }; bestScore = score; }
    }
    if (!best || bestScore === 0) { ambiguous++; continue; }
    target = best.cand;
    usedParsedKeys.add(best.candKey);
    ambResolved++;
  }
  matched++;
  const have = choiceIdxByProblem.get(dp.problem_id) ?? new Set();
  for (const c of target.choices) {
    if (have.has(c.index)) continue; // 정상 row — 절대 건드리지 않음.
    inserts.push({
      problem_id: dp.problem_id,
      choice_index: c.index,
      body_md: c.body,
      is_correct: c.index === target.correctIndex,
      explanation_md: target.choiceExplanations?.[c.index] ?? null,
      _label: `#${dp.problem_number} idx=${c.index} | ${c.body.slice(0, 50)}`,
    });
  }
}

console.log(`\n=== 매칭 ===`);
console.log(`  DB expected problems       : ${dbProbs.length}`);
console.log(`  parsed problems (with choices): ${[...parsedByKey.values()].filter(v => v !== "AMBIGUOUS").length}`);
console.log(`  matched                     : ${matched}`);
console.log(`  no parsed match             : ${noMatch}`);
console.log(`  ambiguous resolved by body  : ${ambResolved}`);
console.log(`  ambiguous unresolved        : ${ambiguous}`);
console.log(`\n=== 보충 대상 (누락 choice) ${inserts.length}건 ===`);
for (const ins of inserts.slice(0, 40)) console.log("  " + ins._label);
if (inserts.length > 40) console.log(`  … (+${inserts.length - 40})`);

if (!APPLY) {
  console.log(`\n(dry-run — INSERT 미수행. --apply 로 실행)`);
  process.exit(0);
}

console.log(`\n=== APPLY — INSERT 시작 ===`);
let ok = 0;
let fail = 0;
for (const ins of inserts) {
  const { _label, ...row } = ins;
  const { error } = await supa.from("problem_choices").insert(row);
  if (error) {
    fail++;
    console.error(`  실패 ${_label}: ${error.message}`);
  } else {
    ok++;
  }
}
console.log(`\n완료 — ok=${ok} fail=${fail}`);

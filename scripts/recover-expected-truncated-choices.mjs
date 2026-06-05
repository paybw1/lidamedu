// parse-problems.mjs 의 옛 splitChoices 결함(단조성 가드 이전)으로 잘린 expected
// choice body 를 수정된 expected-merged.json 전체 텍스트로 복원.
//
// 결함: 지문 본문에 내부 원문자(②③④⑤)가 있으면 옛 split 이 그 지점에서 잘랐다.
//   원본 "③ 지식재산처장 또는 심판관은 ②의 경우에 의한 중지 결정을 취소할 수 있다."
//   → DB 에 "지식재산처장 또는 심판관은" 까지만 저장.
// 수정된 parser 로 재생성한 expected-merged.json 에는 전체 텍스트가 들어있다.
//
// 정책 (안전):
//   - DB choice body 가 parsed choice body 의 "순수 prefix(더 짧음)" 일 때만 UPDATE.
//     → 잘린 경우의 확실한 시그니처. 운영자 수기 편집/정상 row 는 prefix 가 아니므로 불변.
//   - 매칭: norm(stem) 1:1. 중복 stem 은 choice body 겹침(exact|prefix) 점수로 해소.
//   - 같은 길이/불일치(neither exact nor prefix)는 건드리지 않고 리포트만.
//
// 사용:
//   node scripts/recover-expected-truncated-choices.mjs            # dry-run
//   node scripts/recover-expected-truncated-choices.mjs --apply

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

const norm = (s) => (s ?? "").replace(/\s+/g, "").slice(0, 200);
// 공백 정규화 후 prefix 판정 — 잘린 쪽(a)이 전체(b)의 앞부분이고 더 짧은가.
const normBody = (s) => (s ?? "").replace(/\s+/g, " ").trim();
function isTruncatedPrefix(dbBody, fullBody) {
  const a = normBody(dbBody);
  const b = normBody(fullBody);
  return b.length > a.length && b.startsWith(a) && a.length > 0;
}
function bodyMatches(dbBody, parsedBody) {
  // ambiguous 해소 점수용 — exact 또는 prefix(잘림) 면 같은 문제로 본다.
  const a = normBody(dbBody);
  const b = normBody(parsedBody);
  return a === b || b.startsWith(a) || a.startsWith(b);
}

// 1) parsed problems 인덱싱 — norm(stem) → unique 또는 ambiguous 그룹.
const parsedByKey = new Map();
const ambiguousGroup = new Map();
for (const p of parsedProblems) {
  if (!p.choices || p.choices.length === 0) continue;
  const key = norm(p.stem);
  if (!key) continue;
  if (parsedByKey.has(key)) {
    const prev = parsedByKey.get(key);
    if (prev === "AMBIGUOUS") ambiguousGroup.get(key).push(p);
    else {
      parsedByKey.set(key, "AMBIGUOUS");
      ambiguousGroup.set(key, [prev, p]);
    }
    continue;
  }
  parsedByKey.set(key, p);
}

// 2) DB expected patent problems + choices.
const { data: lawRow } = await supa
  .from("laws").select("law_id").eq("law_code", "patent").single();
const { data: dbProbs } = await supa
  .from("problems")
  .select("problem_id, body_md, problem_number")
  .eq("law_id", lawRow.law_id)
  .eq("origin", "expected")
  .is("deleted_at", null)
  .order("problem_id"); // 결정론적 순서.

const problemIds = (dbProbs ?? []).map((p) => p.problem_id);
const CHUNK = 100;
const dbChoicesByProblem = new Map(); // problem_id → [{choice_id, choice_index, body_md}]
for (let i = 0; i < problemIds.length; i += CHUNK) {
  const ids = problemIds.slice(i, i + CHUNK);
  const { data: rows } = await supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, body_md")
    .in("problem_id", ids);
  for (const r of rows ?? []) {
    if (!dbChoicesByProblem.has(r.problem_id))
      dbChoicesByProblem.set(r.problem_id, []);
    dbChoicesByProblem.get(r.problem_id).push(r);
  }
}

// 3) 매칭 + 잘림 탐지.
// 같은 norm(stem) 후보 전체 중 정렬 점수(exact|prefix) 최고 후보 선택.
// 독점 점유 없음 — 순서 무관 결정론적. tie-break: (chapter, problemNumber).
const candidatesByKey = new Map(); // key → parsed[]
for (const p of parsedProblems) {
  if (!p.choices || p.choices.length === 0) continue;
  const key = norm(p.stem);
  if (!key) continue;
  if (!candidatesByKey.has(key)) candidatesByKey.set(key, []);
  candidatesByKey.get(key).push(p);
}

let matched = 0, noMatch = 0, ambiguousUnresolved = 0;
const updates = [];   // {choice_id, problem_number, choice_index, oldBody, newBody}
const mismatches = []; // 정렬 안 되는 choice (neither exact nor prefix) — 리포트만

function alignScore(cand, dbChoices) {
  let score = 0;
  for (const c of cand.choices) {
    const db = dbChoices.find((d) => d.choice_index === c.index);
    if (db && bodyMatches(db.body_md, c.body)) score++;
  }
  return score;
}

for (const dp of dbProbs) {
  const key = norm(dp.body_md);
  const candidates = candidatesByKey.get(key);
  if (!candidates || candidates.length === 0) { noMatch++; continue; }
  const dbChoices = dbChoicesByProblem.get(dp.problem_id) ?? [];

  let target = candidates[0], bestScore = -1;
  if (candidates.length > 1) {
    for (const cand of candidates) {
      const score = alignScore(cand, dbChoices);
      const better =
        score > bestScore ||
        (score === bestScore &&
          `${cand.chapter}:${cand.problemNumber}` <
            `${target.chapter}:${target.problemNumber}`);
      if (better) { target = cand; bestScore = score; }
    }
    if (bestScore <= 0) { ambiguousUnresolved++; continue; }
  }
  matched++;

  for (const db of dbChoices) {
    const pc = target.choices.find((c) => c.index === db.choice_index);
    if (!pc) continue;
    if (normBody(db.body_md) === normBody(pc.body)) continue; // 정상.
    if (isTruncatedPrefix(db.body_md, pc.body)) {
      updates.push({
        choice_id: db.choice_id,
        problem_number: dp.problem_number,
        choice_index: db.choice_index,
        oldBody: db.body_md,
        newBody: pc.body,
      });
    } else {
      mismatches.push({
        problem_number: dp.problem_number,
        choice_index: db.choice_index,
        dbLen: normBody(db.body_md).length,
        pcLen: normBody(pc.body).length,
        db: db.body_md.slice(0, 45),
        pc: pc.body.slice(0, 45),
      });
    }
  }
}

console.log(`\n=== 매칭 ===`);
console.log(`  DB expected problems    : ${dbProbs.length}`);
console.log(`  matched                 : ${matched}`);
console.log(`  no parsed match         : ${noMatch}`);
console.log(`  ambiguous unresolved    : ${ambiguousUnresolved}`);

console.log(`\n=== 잘린 지문 복구 대상 ${updates.length}건 ===`);
for (const u of updates) {
  console.log(
    `  #${u.problem_number} idx=${u.choice_index}  ${normBody(u.oldBody).length}→${normBody(u.newBody).length}자`,
  );
  console.log(`     old: ${JSON.stringify(u.oldBody.slice(0, 60))}`);
  console.log(`     new: ${JSON.stringify(u.newBody.slice(0, 80))}`);
}

console.log(`\n=== 정렬 불일치(복구 대상 아님, 리포트) ${mismatches.length}건 ===`);
for (const m of mismatches.slice(0, 30)) {
  console.log(
    `  #${m.problem_number} idx=${m.choice_index}  db=${m.dbLen}자 pc=${m.pcLen}자`,
  );
  console.log(`     db: ${JSON.stringify(m.db)}`);
  console.log(`     pc: ${JSON.stringify(m.pc)}`);
}
if (mismatches.length > 30) console.log(`  … (+${mismatches.length - 30})`);

// 3.5) Ground-truth 검증 — 복구할 전체 텍스트가 문제편 원본 paragraph 에
// 실제로 존재하는지 대조. 원본 paragraph 는 "① …" 처럼 선지 마커로 시작하므로
// 선두 마커 제거 후 normBody 비교. 원본에 있는 건만 신뢰(verified)로 적용.
const rawProblems = JSON.parse(
  readFileSync("source/_converted/expected-problems.json", "utf8"),
);
const rawBodies = new Set();
for (const para of rawProblems.paragraphs ?? []) {
  for (const line of String(para.text ?? "").split(/\n/)) {
    const stripped = line.replace(/^\s*[①②③④⑤]\s*/, "");
    const nb = normBody(stripped);
    if (nb) rawBodies.add(nb);
  }
}
for (const u of updates) u.verified = rawBodies.has(normBody(u.newBody));
const verified = updates.filter((u) => u.verified);
const unverified = updates.filter((u) => !u.verified);
console.log(`\n=== Ground-truth 검증 ===`);
console.log(`  원본 일치(verified)   : ${verified.length}`);
console.log(`  원본 불일치(unverified): ${unverified.length}`);
for (const u of unverified) {
  console.log(`  ⚠ #${u.problem_number} idx=${u.choice_index} — 원본 미발견, 적용 제외`);
  console.log(`     new: ${JSON.stringify(u.newBody.slice(0, 80))}`);
}

if (!APPLY) {
  console.log(`\n(dry-run — UPDATE 미수행. --apply 로 실행)`);
  process.exit(0);
}

console.log(`\n=== APPLY — UPDATE 시작 (verified ${verified.length}건만) ===`);
let ok = 0, fail = 0;
for (const u of verified) {
  const { error } = await supa
    .from("problem_choices")
    .update({ body_md: u.newBody })
    .eq("choice_id", u.choice_id);
  if (error) { fail++; console.error(`  실패 #${u.problem_number} idx=${u.choice_index}: ${error.message}`); }
  else ok++;
}
console.log(`\n완료 — ok=${ok} fail=${fail}`);

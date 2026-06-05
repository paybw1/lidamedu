// 예상문제 전수 무결성 감사 (읽기 전용).
// 가드 적용 파서로 재생성한 expected-merged.json(정답 레퍼런스)과 운영 DB 의 모든
// 지문(problem_choices)·보기(problem_box_items)를 대조해 불일치를 분류·리포트.
//
// 분류:
//   truncated_tail : DB 가 정답의 앞부분(prefix), 더 짧음 → 뒤가 잘림(버그 유력)
//   truncated_front: DB 가 정답의 뒷부분(suffix), 더 짧음 → 앞이 잘림(버그 유력)
//   missing        : 정답엔 있는데 DB 에 없음(누락)
//   spurious       : DB 에만 있고 정답에 없음(가짜/중복)
//   db_longer      : DB 가 정답을 포함하며 더 김 → 운영자가 덧붙임(검토)
//   mismatch       : 그 외 불일치 → 운영자 수정 또는 손상(검토)
//
//   node scripts/diag/audit-expected-integrity.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log(`proj: ${process.env.SUPABASE_URL}`);

const merged = JSON.parse(readFileSync("source/_converted/expected-merged.json", "utf8"));
const norm = (s) => (s ?? "").replace(/\s+/g, "").slice(0, 200);
// 비교용 정규화 — 표 잔재 "|" 는 의미 없는 artifact 라 공백 취급(오탐 방지).
const nb = (s) => (s ?? "").replace(/\|/g, " ").replace(/\s+/g, " ").trim();

function classify(dbBody, refBody) {
  const a = nb(dbBody), b = nb(refBody);
  if (a === b) return "ok";
  if (b.startsWith(a)) return "truncated_tail";
  if (b.endsWith(a)) return "truncated_front";
  if (a.startsWith(b) || a.endsWith(b)) return "db_longer";
  return "mismatch";
}
const related = (c) => c === "ok" || c === "truncated_tail" || c === "truncated_front" || c === "db_longer";

// 후보 인덱싱
const candByKey = new Map();
for (const p of merged.problems) {
  const k = norm(p.stem);
  if (!k) continue;
  if (!candByKey.has(k)) candByKey.set(k, []);
  candByKey.get(k).push(p);
}

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: dbProbs } = await supa.from("problems")
  .select("problem_id, body_md").eq("law_id", law.law_id).eq("origin", "expected").is("deleted_at", null).order("problem_id");
const ids = dbProbs.map((p) => p.problem_id);
const chBy = new Map(), bxBy = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const sl = ids.slice(i, i + 100);
  const { data: ch } = await supa.from("problem_choices").select("problem_id, choice_index, body_md").in("problem_id", sl);
  for (const c of ch ?? []) { if (!chBy.has(c.problem_id)) chBy.set(c.problem_id, []); chBy.get(c.problem_id).push(c); }
  const { data: bx } = await supa.from("problem_box_items").select("problem_id, marker, position_index, body_md").in("problem_id", sl);
  for (const b of bx ?? []) { if (!bxBy.has(b.problem_id)) bxBy.set(b.problem_id, []); bxBy.get(b.problem_id).push(b); }
}

const findings = []; // {pid, stem, kind, scope, detail}
let noMatch = 0, matched = 0;

for (const dp of dbProbs) {
  const cands = candByKey.get(norm(dp.body_md));
  const dbCh = (chBy.get(dp.problem_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
  const dbBx = (bxBy.get(dp.problem_id) ?? []).sort((a, b) => a.position_index - b.position_index);
  if (!cands || cands.length === 0) {
    noMatch++;
    findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: "no_source_match", scope: "problem", detail: "stem 이 원본과 매칭 안 됨(운영자 stem 수정?)" });
    continue;
  }
  // 최적 후보: choice body 관련도 점수
  let ref = cands[0];
  if (cands.length > 1) {
    let best = -1;
    for (const c of cands) {
      let s = 0;
      for (const cc of c.choices) { const db = dbCh.find((d) => d.choice_index === cc.index); if (db && related(classify(db.body_md, cc.body))) s++; }
      if (s > best) { best = s; ref = c; }
    }
  }
  matched++;

  // 지문 비교
  const refChByIdx = new Map((ref.choices ?? []).map((c) => [c.index, c.body]));
  const dbChByIdx = new Map(dbCh.map((c) => [c.choice_index, c.body_md]));
  const allIdx = new Set([...refChByIdx.keys(), ...dbChByIdx.keys()]);
  for (const idx of [...allIdx].sort((a, b) => a - b)) {
    const refB = refChByIdx.get(idx), dbB = dbChByIdx.get(idx);
    if (refB == null) { findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: "spurious", scope: `choice#${idx}`, detail: nb(dbB).slice(0, 60) }); continue; }
    if (dbB == null) { findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: "missing", scope: `choice#${idx}`, detail: nb(refB).slice(0, 60) }); continue; }
    const c = classify(dbB, refB);
    if (c !== "ok") findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: c, scope: `choice#${idx}`, detail: `db(${nb(dbB).length}) "${nb(dbB).slice(0, 40)}" | ref(${nb(refB).length}) "${nb(refB).slice(0, 40)}"` });
  }

  // 보기 비교 (marker 기준)
  const refBx = ref.boxItems ?? [];
  if (refBx.length || dbBx.length) {
    const refByMarker = new Map(refBx.map((b) => [b.marker, b.body]));
    const dbByMarker = new Map(dbBx.map((b) => [b.marker, b.body_md]));
    const allM = new Set([...refByMarker.keys(), ...dbByMarker.keys()]);
    for (const mk of allM) {
      const refB = refByMarker.get(mk), dbB = dbByMarker.get(mk);
      if (refB == null) { findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: "spurious", scope: `box ${mk}`, detail: nb(dbB).slice(0, 60) }); continue; }
      if (dbB == null) { findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: "missing", scope: `box ${mk}`, detail: nb(refB).slice(0, 60) }); continue; }
      const c = classify(dbB, refB);
      if (c !== "ok") findings.push({ pid: dp.problem_id, stem: dp.body_md, kind: c, scope: `box ${mk}`, detail: `db(${nb(dbB).length}) "${nb(dbB).slice(0, 36)}" | ref(${nb(refB).length}) "${nb(refB).slice(0, 36)}"` });
    }
  }
}

console.log(`\nDB expected 문제: ${dbProbs.length} (matched ${matched}, no_source_match ${noMatch})`);
const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`\n=== 불일치 분류 합계 ===`);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

const BUG = ["truncated_tail", "truncated_front", "missing", "spurious"];
const REVIEW = ["db_longer", "mismatch", "no_source_match"];
const dump = (kinds, label) => {
  const rows = findings.filter((f) => kinds.includes(f.kind));
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const f of rows.slice(0, 80))
    console.log(`  [${f.kind}] ${f.pid} ${f.scope} | ${JSON.stringify((f.stem ?? "").slice(0, 24))}\n     ${f.detail}`);
  if (rows.length > 80) console.log(`  … (+${rows.length - 80})`);
};
dump(BUG, "버그 유력 — 잘림/누락/가짜");
dump(REVIEW, "검토 — 운영자 수정 가능성");

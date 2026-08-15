// 특허 객관식 정답·해설 오배정 정정 (2026-08-15)
//   node scripts/mcq-audit/backups/apply-fixes.mjs            → dry-run (기본)
//   node scripts/mcq-audit/backups/apply-fixes.mjs --apply    → 실제 반영
// 반영 전 현재 값을 scripts/mcq-audit/backups/backup-fixes-2.json 에 저장한다.
import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { parseAnswers, norm } from "./parse-answers.mjs";

const APPLY = process.argv.includes("--apply");
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const gichul = parseAnswers(JSON.parse(readFileSync("source/_converted/answer.json", "utf8")).paragraphs);

// 교재 해설의 앞머리 표기(`✕, ` `○, ` `는 `)는 DB 관례상 붙이지 않는다.
const clean = (s) =>
  (s ?? "").replace(/^\s*[○◯✕×]\s*,?\s*/, "").replace(/^는\s+/, "").trim();

function entry(section, number, dbChoices) {
  const cands = gichul.filter((e) => e.section === section && e.number === number);
  if (cands.length === 0) throw new Error(`원본 없음: ${section} ${number}`);
  if (cands.length === 1) return cands[0];
  // 후보가 여럿이면 DB 해설과 가장 잘 맞는 것 (실시권 일반처럼 단원이 두 번 나오는 경우)
  const score = (e) =>
    dbChoices.filter((c) => {
      const a = norm(e.perChoice[c.choice_index]), b = norm(c.explanation_md);
      return a && b && (b.startsWith(a.slice(0, 25)) || a.startsWith(b.slice(0, 25)));
    }).length;
  const ranked = cands.map((e) => ({ e, s: score(e) })).sort((x, y) => y.s - x.s);
  if (ranked[0].s === ranked[1]?.s) throw new Error(`후보 동점: ${section} ${number}`);
  return ranked[0].e;
}

// 정정 대상. explFrom 이 있으면 그 원본 엔트리의 선지별 해설로 전면 교체한다.
const TARGETS = [
  { displayNo: 8070, answer: [4], explFrom: null, why: "정답 ③→④ (원본 ④ · ④는 202②단서로 지위 불인정)" },
];

const backup = [];
const plan = [];
for (const t of TARGETS) {
  const { data: probs } = await supa.from("problems").select("problem_id, display_no, year, problem_number").eq("display_no", t.displayNo);
  const p = probs?.[0];
  if (!p) throw new Error(`문제 없음: P-${t.displayNo}`);
  const { data: cs } = await supa.from("problem_choices")
    .select("choice_id, choice_index, is_correct, explanation_md").eq("problem_id", p.problem_id).order("choice_index");
  backup.push({ displayNo: t.displayNo, problemId: p.problem_id, choices: cs });

  const src = t.explFrom ? entry(t.explFrom[0], t.explFrom[1], cs) : null;
  const updates = [];
  for (const c of cs) {
    const next = {};
    if (t.answer) {
      const want = t.answer.includes(c.choice_index);
      if (c.is_correct !== want) next.is_correct = want;
    }
    if (src) {
      const wanted = clean(src.perChoice[c.choice_index]);
      // 마침표·공백만 다른 경우는 손대지 않는다 (불필요한 변경 방지).
      if (wanted && norm(wanted) !== norm(c.explanation_md)) next.explanation_md = wanted;
    }
    if (Object.keys(next).length) updates.push({ choiceId: c.choice_id, idx: c.choice_index, next, was: { is_correct: c.is_correct, explanation_md: c.explanation_md } });
  }
  plan.push({ t, p, updates });
}

writeFileSync("scripts/mcq-audit/backups/backup-fixes-2.json", JSON.stringify(backup, null, 1), "utf8");
console.log(`백업 저장: scripts/mcq-audit/backups/backup-fixes-2.json (${backup.length}문항)\n`);

for (const { t, p, updates } of plan) {
  console.log(`P-${t.displayNo} ${p.year ?? "-"}년 ${p.problem_number}번 — ${t.why}`);
  for (const u of updates) {
    if ("is_correct" in u.next) console.log(`   ${u.idx}) 정답 ${u.was.is_correct} → ${u.next.is_correct}`);
    if ("explanation_md" in u.next) {
      console.log(`   ${u.idx}) 해설 변경`);
      console.log(`        전: ${(u.was.explanation_md ?? "").replace(/\s+/g, " ").slice(0, 90)}`);
      console.log(`        후: ${u.next.explanation_md.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  console.log("");
}

if (!APPLY) {
  console.log("dry-run — 반영하려면 --apply");
  process.exit(0);
}
let n = 0;
for (const { updates } of plan) {
  for (const u of updates) {
    const { error } = await supa.from("problem_choices").update(u.next).eq("choice_id", u.choiceId);
    if (error) throw error;
    n++;
  }
}
console.log(`✓ ${n}개 선지 반영 완료`);

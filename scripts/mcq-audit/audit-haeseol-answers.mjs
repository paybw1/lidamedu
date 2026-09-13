// 해설편 정답줄 ↔ DB 정답 전수 대조.
//
// ★왜 필요한가(2026-09-13): 해설 오배정은 **길이에도 매칭률에도 안 잡힌다.**
//   벌칙 절이 「01 ③ / 02 ⑤ / 02 ②」로 찍힌 책 오타 때문에 뒤엣것이 앞엣것을 덮어써,
//   P-7867 에 남의 해설(양벌규정)이 들어가고 P-7868·P-8012 가 빈 채로 남았다.
//   매칭률 99.7%·길이 정상이라 아무 신호도 없었고, **정답 대조로만** 드러났다.
//   해설을 적재하면 반드시 이걸 돌린다.
//
// ★정답 소스는 problem_choices.is_correct (choice_index 1~5) **단일**.
//   problems 에는 객관식 정답 컬럼이 없다(model_answer_md 는 주관식용).
// ★전 선지 정답은 출제오류 처리분이므로 불일치가 아니다 — 따로 센다.
//
//   node scripts/mcq-audit/audit-haeseol-answers.mjs <plan.json>

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const planPath = process.argv[2];
if (!planPath || !fs.existsSync(planPath)) {
  console.error("사용: node scripts/mcq-audit/audit-haeseol-answers.mjs <plan.json>");
  process.exit(1);
}

const CIRCLED = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };
const toSet = (s) => new Set([...String(s ?? "")].map((c) => CIRCLED[c]).filter(Boolean));
const fmt = (s) => [...s].sort((a, b) => a - b).map((n) => "①②③④⑤"[n - 1]).join("") || "(없음)";
const eq = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ids = plan.map((p) => p.problemId);
const rows = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await supa
    .from("problem_choices")
    .select("problem_id, choice_index, is_correct")
    .in("problem_id", ids.slice(i, i + 100));
  if (error) throw error;
  rows.push(...data);
}
const dbBy = new Map();
for (const r of rows) {
  if (!dbBy.has(r.problem_id)) dbBy.set(r.problem_id, { correct: new Set(), total: 0 });
  const e = dbBy.get(r.problem_id);
  e.total += 1;
  if (r.is_correct) e.correct.add(r.choice_index);
}

const out = { 일치: [], 불일치: [], 전항정답: [], 선지없음: [], 책정답없음: [] };
for (const p of plan) {
  const book = toSet(p.answer);
  const db = dbBy.get(p.problemId);
  if (!db || db.total === 0) { out.선지없음.push({ p }); continue; }
  if (book.size === 0) { out.책정답없음.push({ p, db }); continue; }
  if (db.correct.size === db.total) { out.전항정답.push({ p, book, db }); continue; }
  (eq(book, db.correct) ? out.일치 : out.불일치).push({ p, book, db });
}

console.log(`대조 ${plan.length}건 — 선지 ${rows.length}개`);
console.log(`  일치         ${out.일치.length}`);
console.log(`  불일치       ${out.불일치.length}`);
console.log(`  전항 정답    ${out.전항정답.length}  (출제오류 처리분 — 정정 대상 아님)`);
console.log(`  DB 선지 없음 ${out.선지없음.length}`);
console.log(`  책 정답 없음 ${out.책정답없음.length}`);

if (out.불일치.length) {
  console.log("\n[불일치 — 오배정 의심. 발문과 해설을 눈으로 대조할 것]");
  for (const { p, book, db } of out.불일치)
    console.log(`  P-${p.displayNo}  ${(p.section + "#" + p.no).padEnd(30)} 책 ${fmt(book).padEnd(4)} vs DB ${fmt(db.correct).padEnd(4)}  ← ${p.matchedKey}`);
}
for (const { p, book, db } of out.전항정답)
  console.log(`  [전항] P-${p.displayNo} ${p.section}#${p.no}  책 ${fmt(book)} · DB 전 ${db.total}선지`);

const OUT = "scripts/mcq-audit/answer-mismatch.tsv";
fs.writeFileSync(OUT, ["problem_id\tdisplay_no\tsection\tno\tmatched_key\t책정답\tDB정답",
  ...out.불일치.map(({ p, book, db }) =>
    [p.problemId, p.displayNo, p.section, p.no, p.matchedKey, fmt(book), fmt(db.correct)].join("\t"))].join("\n") + "\n", "utf8");
console.log(`\n→ ${OUT} (${out.불일치.length}건)`);

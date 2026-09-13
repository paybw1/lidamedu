// 새 해설이 기존보다 짧은 건을 뽑아 TSV 로 남긴다(지시서 3).
// ★기존 본문은 계획 JSON 에 없다(curLen 뿐) — DB 에서 가져온다.
//
//   node scripts/mcq-audit/list-shorter.mjs <plan.json> [--show N]

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import "dotenv/config";

const planPath = process.argv[2];
const showIdx = process.argv.indexOf("--show");
const SHOW = showIdx >= 0 ? Number(process.argv[showIdx + 1]) : 0;
const OUT = "scripts/mcq-audit/skip-shorter.tsv";

const toMarkdown = (body) =>
  String(body ?? "")
    .replace(/^해설\s*/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const shorter = plan
  .map((p) => ({ ...p, mdLen: toMarkdown(p.body).length }))
  .filter((p) => p.mdLen < p.curLen)
  .map((p) => ({ ...p, diff: p.curLen - p.mdLen }))
  .sort((a, b) => b.diff - a.diff);

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await supa
  .from("problems")
  .select("problem_id, explanation_md")
  .in("problem_id", shorter.map((s) => s.problemId));
if (error) throw error;
const oldBy = new Map(data.map((d) => [d.problem_id, d.explanation_md ?? ""]));

const lines = ["problem_id\tdisplay_no\tsection\tno\told_len\tnew_len\tdiff"];
for (const s of shorter)
  lines.push(
    [s.problemId, s.displayNo, s.section, s.no, s.curLen, s.mdLen, s.diff].join("\t"),
  );
fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
console.log(`${shorter.length}건 → ${OUT}\n`);
console.log("display_no  단원#번호                     기존   교재    차이");
for (const s of shorter)
  console.log(
    `P-${s.displayNo}  ${`${s.section}#${s.no}`.padEnd(28)} ${String(s.curLen).padStart(5)} ${String(s.mdLen).padStart(6)} ${String(s.diff).padStart(6)}`,
  );

for (const s of shorter.slice(0, SHOW)) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`P-${s.displayNo}  ${s.section}#${s.no}  기존 ${s.curLen}자 → 교재 ${s.mdLen}자 (−${s.diff})`);
  console.log(`${"-".repeat(78)}\n[기존 DB 본문]\n`);
  console.log(oldBy.get(s.problemId));
  console.log(`\n${"-".repeat(78)}\n[해설편 본문]\n`);
  console.log(toMarkdown(s.body));
}

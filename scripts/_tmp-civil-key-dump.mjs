// TEMP (read-only): 민법 문제 정답키 + 선지 텍스트 덤프 → scratchpad JSON
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node scripts/_tmp-civil-key-dump.mjs <out.json>");

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: law, error: le } = await sb
  .from("laws")
  .select("law_id")
  .eq("law_code", "civil")
  .single();
if (le) throw le;

const problems = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("problems")
    .select(
      "problem_id, year, problem_number, body_md, problem_choices(choice_index, body_md, is_correct)",
    )
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .order("problem_id")
    .range(from, from + 999);
  if (error) throw error;
  problems.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const byYear = {};
for (const p of problems) {
  const y = (byYear[p.year] ??= {});
  const choices = [...p.problem_choices].sort((a, b) => a.choice_index - b.choice_index);
  y[p.problem_number] = {
    problem_id: p.problem_id,
    answer: choices.filter((c) => c.is_correct).map((c) => c.choice_index),
    question: (p.body_md ?? "").slice(0, 120),
    choices: choices.map((c) => ({ i: c.choice_index, t: (c.body_md ?? "").slice(0, 160) })),
  };
}

writeFileSync(OUT, JSON.stringify(byYear, null, 1), "utf8");
const years = Object.keys(byYear).sort();
console.log(
  "years:",
  years.map((y) => `${y}(${Object.keys(byYear[y]).length})`).join(" "),
);

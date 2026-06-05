// 한 problem 의 choices/box_items 와 본문을 빠르게 출력.
//   node scripts/diag/check-problem-choices.mjs <problem_id>
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/diag/check-problem-choices.mjs <problem_id>");
  process.exit(1);
}
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: p } = await supa
  .from("problems")
  .select(
    "problem_id, format, origin, year, problem_number, body_md, primary_article_id, articles!primary_article_id(article_number, display_label)",
  )
  .eq("problem_id", id)
  .maybeSingle();
if (!p) {
  console.error("not found");
  process.exit(1);
}
console.log("=== problem ===");
console.log(`format=${p.format} origin=${p.origin} year=${p.year} #${p.problem_number}`);
console.log(`article=${p.articles?.display_label ?? "—"}`);
console.log(`bodyMd (${p.body_md.length}자):`);
console.log(p.body_md);
console.log();

const { data: choices } = await supa
  .from("problem_choices")
  .select("choice_id, choice_index, body_md, is_correct, choice_type, ox_truth, ox_ineligible")
  .eq("problem_id", id)
  .order("choice_index", { ascending: true });
console.log(`=== choices (${choices?.length ?? 0}) ===`);
for (const c of choices ?? []) {
  console.log(
    `[${c.choice_index}] ${c.is_correct ? "✓ " : "  "}type=${c.choice_type ?? "-"} ox=${c.ox_truth ?? "-"}${c.ox_ineligible ? "/X" : ""} | ${c.body_md.slice(0, 80)}`,
  );
}

const { data: boxes } = await supa
  .from("problem_box_items")
  .select("box_item_id, marker, body_md, choice_type, ox_truth")
  .eq("problem_id", id)
  .order("marker", { ascending: true });
console.log(`\n=== box_items (${boxes?.length ?? 0}) ===`);
for (const b of boxes ?? []) {
  console.log(`[${b.marker}] type=${b.choice_type ?? "-"} ox=${b.ox_truth ?? "-"} | ${b.body_md.slice(0, 80)}`);
}

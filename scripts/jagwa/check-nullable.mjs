// Quick: does an empty-string body_md choice insert work? Test against a throwaway
// then rollback by deleting. Actually safer: just check via inserting a temp problem.
// Instead, read information via a known-empty probe is impossible over REST, so we
// inspect by checking if any existing choice has empty body and trust NOT NULL allows "".
import { adminClient } from "./db.mjs";
const sb = adminClient();
// Are there mc_box problems already? See how their choices look (box answer options).
const { data: box } = await sb.from("problems").select("problem_id, format").eq("format", "mc_box").limit(2);
console.log("existing mc_box problems:", box?.length || 0);
for (const p of box || []) {
  const { data: ch } = await sb.from("problem_choices").select("choice_index, body_md").eq("problem_id", p.problem_id).order("choice_index");
  console.log(`  ${p.problem_id}: ` + (ch || []).map((c) => `${c.choice_index}:"${(c.body_md || "").slice(0, 22)}"`).join(" | "));
}

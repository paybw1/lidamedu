// 주어진 과목의 factbox 적용분 중 아직 case-box 가 남아있는 문제를 찾는다(읽기 전용).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const subjects = process.argv.slice(2);
const work = JSON.parse(
  fs.readFileSync(path.join("scripts", "jagwa", ".factbox", "worklist.json"), "utf8"),
);
const ids = work
  .filter((o) => (o.status === "auto" || o.status === "review") && subjects.includes(o.lawCode))
  .map((o) => o.problemId);

const { data } = await sb
  .from("problems")
  .select("problem_id, body_md")
  .in("problem_id", ids)
  .like("body_md", "%case-box%");

console.log(`아직 박스 남은 문제: ${data?.length ?? 0}`);
for (const r of data ?? []) {
  console.log(`\n[${r.problem_id}]`);
  console.log(r.body_md.replace(/\n/g, "⏎").slice(0, 300));
}

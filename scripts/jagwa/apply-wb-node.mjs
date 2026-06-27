// wb-node-worklist.json 의 target 으로 primary_node_id 일괄 고정(워크북 기준 단원 배치).
// 적용 전 현재 primary_node_id 를 .factbox/wb-node-backup.json 에 백업(롤백용).
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const work = JSON.parse(readFileSync("scripts/jagwa/.factbox/wb-node-worklist.json", "utf8"));
const apply = process.argv.includes("--apply");

// 백업(현재 primary_node_id) — worklist.current 에 이미 담겨 있음.
const backup = work.map((w) => ({ problemId: w.problemId, primary_node_id: w.current }));
if (apply) {
  writeFileSync("scripts/jagwa/.factbox/wb-node-backup.json", JSON.stringify(backup, null, 2));
  console.log(`백업 ${backup.length} → .factbox/wb-node-backup.json`);
}

console.log(`대상 ${work.length}건 ${apply ? "적용" : "(점검 — --apply 로 적용)"}`);
if (!apply) process.exit(0);

let ok = 0, fail = 0;
for (const w of work) {
  const { error } = await sb
    .from("problems")
    .update({ primary_node_id: w.target, updated_at: new Date().toISOString() })
    .eq("problem_id", w.problemId);
  if (error) { console.log("ERR", w.problemId, error.message); fail++; } else ok++;
}
console.log(`적용 ${ok} / 실패 ${fail}`);
console.log("롤백: .factbox/wb-node-backup.json 의 primary_node_id 로 복원");

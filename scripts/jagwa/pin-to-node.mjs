// 지정한 문제(problem_id)들을 특정 systematic 노드로 primary_node_id 고정(=그 노드에만 노출).
// 노드 오배치 수동 교정용. usage:
//   node scripts/jagwa/pin-to-node.mjs --to <nodeId> --ids <id,id,...> [--apply]
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!process.env.SUPABASE_URL.includes("mcgdoplo")) throw new Error("SAFETY: not prod");

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const dstNode = arg("--to");
const ids = (arg("--ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const apply = process.argv.includes("--apply");
if (!dstNode || ids.length === 0) throw new Error("need --to <nodeId> --ids <id,id,...>");

const { data: dst } = await sb.from("systematic_nodes").select("display_label").eq("node_id", dstNode).single();
const snip = (s) => (s ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
console.log(`대상 노드: "${dst?.display_label ?? dstNode}" (${dstNode})\n`);

let ok = 0, fail = 0;
for (const id of ids) {
  const { data: p } = await sb
    .from("problems")
    .select("problem_id, problem_number, primary_node_id, body_md")
    .eq("problem_id", id)
    .maybeSingle();
  if (!p) { console.log(`  [${id}] ❌ 없음`); fail++; continue; }
  console.log(`  no.${p.problem_number ?? "?"} ${id} (현재 node=${p.primary_node_id ?? "NULL/파생"}) — ${snip(p.body_md)}`);
  if (!apply) continue;
  const { error } = await sb
    .from("problems")
    .update({ primary_node_id: dstNode, updated_at: new Date().toISOString() })
    .eq("problem_id", id);
  if (error) { console.log(`     → ERR ${error.message}`); fail++; } else ok++;
}
console.log(`\n${apply ? `고정 ${ok} / 실패 ${fail}` : "점검(미적용) — --apply 로 적용"}`);

// factbox 오박스(false positive) 개별 복구. .factbox/backup.json 의 원본으로 되돌린다.
//   점검(기본): node scripts/jagwa/revert-factbox-ids.mjs <id> [<id> ...]
//   적용:        node scripts/jagwa/revert-factbox-ids.mjs <id> [...] --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing SUPABASE_URL / SERVICE_ROLE_KEY");
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod(mcgdoplo)`);
const sb = createClient(url, key);

const apply = process.argv.includes("--apply");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (ids.length === 0) throw new Error("usage: revert-factbox-ids.mjs <problemId> [...] [--apply]");

const backup = JSON.parse(
  fs.readFileSync(path.join("scripts", "jagwa", ".factbox", "backup.json"), "utf8"),
);
const byId = new Map(backup.map((b) => [b.problemId, b.body_md]));

const short = (s) => (s ?? "").replace(/\n/g, "⏎").slice(0, 220);

let ok = 0, miss = 0, fail = 0;
for (const id of ids) {
  const original = byId.get(id);
  if (original === undefined) {
    console.log(`\n[${id}] ❌ 백업에 없음 — 이 도구로 복구 불가`);
    miss++;
    continue;
  }
  const { data: cur } = await sb
    .from("problems")
    .select("problem_id, body_md")
    .eq("problem_id", id)
    .single();
  console.log(`\n[${id}]`);
  console.log(`  현재(box?): ${cur?.body_md?.includes("case-box") ? "예" : "아니오"} | ${short(cur?.body_md)}`);
  console.log(`  원본 복원 : ${short(original)}`);
  if (!apply) continue;
  const { data, error } = await sb
    .from("problems")
    .update({ body_md: original, updated_at: new Date().toISOString() })
    .eq("problem_id", id)
    .select("problem_id");
  if (error) { console.log(`  → ERR ${error.message}`); fail++; }
  else if (!data?.length) { console.log("  → 행 없음(미적용)"); fail++; }
  else { console.log("  → ✅ 원본 복원 완료"); ok++; }
}
console.log(`\n${apply ? "적용" : "점검(미적용)"} — 복원 ${ok} / 백업없음 ${miss} / 실패 ${fail}`);
if (!apply) console.log("적용하려면 끝에 --apply 추가");

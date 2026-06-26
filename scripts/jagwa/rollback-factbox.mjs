// .factbox/backup.json 의 원본 body_md 로 복원(롤백).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const backup = JSON.parse(
  fs.readFileSync(path.join("scripts", "jagwa", ".factbox", "backup.json"), "utf8"),
);
let ok = 0, fail = 0;
for (const b of backup) {
  const { error } = await sb
    .from("problems")
    .update({ body_md: b.body_md })
    .eq("problem_id", b.problemId);
  if (error) { console.log("ERR", b.problemId, error.message); fail++; } else ok++;
}
console.log(`rolled back ${ok} / fail ${fail}`);

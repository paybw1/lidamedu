// factbox DRY-RUN 적용. worklist.json 의 auto+review 를 case-box 로 일괄 반영.
// 적용 전 원본 body 를 .factbox/backup.json 에 백업(롤백용). 현재 body 가 original 과
// 일치할 때만 업데이트(드라이런 이후 변경분 보호). .env service_role = 운영 mcgdoplo.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing SUPABASE_URL / SERVICE_ROLE_KEY");
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod(mcgdoplo)`);
const sb = createClient(url, key);

const dir = path.join("scripts", "jagwa", ".factbox");
const work = JSON.parse(fs.readFileSync(path.join(dir, "worklist.json"), "utf8"));
const apply = work.filter((o) => o.status === "auto" || o.status === "review");
console.log(`apply 대상: ${apply.length} (auto+review)`);

// 백업.
const backup = apply.map((o) => ({ problemId: o.problemId, body_md: o.original }));
fs.writeFileSync(path.join(dir, "backup.json"), JSON.stringify(backup, null, 2));
console.log(`백업 저장: ${backup.length} → .factbox/backup.json`);

let ok = 0, skipChanged = 0, fail = 0;
for (const o of apply) {
  const { data, error } = await sb
    .from("problems")
    .update({ body_md: o.proposed, updated_at: new Date().toISOString() })
    .eq("problem_id", o.problemId)
    .eq("body_md", o.original) // 드라이런 이후 변경됐으면 skip
    .select("problem_id");
  if (error) { console.log("ERR", o.problemId, error.message); fail++; }
  else if (!data || data.length === 0) { skipChanged++; }
  else ok++;
}
console.log(`\n적용 ${ok} / 변경감지 skip ${skipChanged} / 실패 ${fail}`);
console.log("롤백: backup.json 의 body_md 로 복원");

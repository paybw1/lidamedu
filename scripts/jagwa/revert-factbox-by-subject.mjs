// factbox 일괄 적용분(worklist auto+review)을 과목(lawCode)별로 원본 복구.
//   점검(기본): node scripts/jagwa/revert-factbox-by-subject.mjs patent trademark design
//   적용:        node scripts/jagwa/revert-factbox-by-subject.mjs patent trademark design --apply
// 가드: 현재 body_md 가 적용된 proposed 와 정확히 일치할 때만 원본으로 되돌린다
//       (이미 복구됐거나 이후 수정된 행은 skip).
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
const subjects = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (subjects.length === 0)
  throw new Error("usage: revert-factbox-by-subject.mjs <lawCode...> [--apply]");

const work = JSON.parse(
  fs.readFileSync(path.join("scripts", "jagwa", ".factbox", "worklist.json"), "utf8"),
);
const targets = work.filter(
  (o) => (o.status === "auto" || o.status === "review") && subjects.includes(o.lawCode),
);
console.log(`대상 과목 ${JSON.stringify(subjects)} · 적용분 중 ${targets.length}건`);

let ok = 0, alreadyOriginal = 0, changedSkip = 0, fail = 0;
for (const o of targets) {
  const { data: cur, error: selErr } = await sb
    .from("problems")
    .select("body_md")
    .eq("problem_id", o.problemId)
    .single();
  if (selErr) { console.log("SEL ERR", o.problemId, selErr.message); fail++; continue; }
  if (cur.body_md === o.original) { alreadyOriginal++; continue; } // 이미 원본
  if (cur.body_md !== o.proposed) { changedSkip++; continue; }       // 이후 수정됨 → 보호
  if (!apply) { ok++; continue; }
  const { data, error } = await sb
    .from("problems")
    .update({ body_md: o.original, updated_at: new Date().toISOString() })
    .eq("problem_id", o.problemId)
    .eq("body_md", o.proposed)
    .select("problem_id");
  if (error) { console.log("UPD ERR", o.problemId, error.message); fail++; }
  else if (!data?.length) { changedSkip++; }
  else ok++;
}
console.log(
  `${apply ? "복구" : "복구예정"} ${ok} / 이미원본 ${alreadyOriginal} / 변경감지skip ${changedSkip} / 실패 ${fail}`,
);
if (!apply) console.log("적용하려면 끝에 --apply 추가");

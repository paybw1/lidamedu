// 예상문제 DB explanation_md 의 [IMG:imageN] 마커를 expected-image-map.json 의 URL 로 치환.
// answer 키만 사용 (문제편 이미지는 본문에 없음 — 표지 도판 등이라 제외).
//
//   node scripts/insert-expected-images.mjs --dry-run
//   node scripts/insert-expected-images.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const dryRun = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const map = JSON.parse(
  readFileSync("source/_converted/expected-image-map.json", "utf8"),
);

const { data: lawRow } = await supa
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .single();

const { data: probs } = await supa
  .from("problems")
  .select("problem_id, explanation_md")
  .eq("origin", "expected")
  .eq("law_id", lawRow.law_id)
  .is("deleted_at", null)
  .not("explanation_md", "is", null);

let updated = 0;
let skipped = 0;
let missing = 0;
const missingImgs = [];

for (const p of probs ?? []) {
  if (!/\[IMG:image\d+\]/.test(p.explanation_md ?? "")) continue;
  let next = p.explanation_md;
  let changed = false;
  for (const m of next.matchAll(/\[IMG:image(\d+)\]/g)) {
    const idx = m[1];
    const url = map[`answer:image${idx}`];
    if (!url) {
      missing += 1;
      missingImgs.push(idx);
      continue;
    }
    // markdown image — preceding/trailing newline 으로 한 줄에 떨어뜨림.
    next = next.replace(m[0], `\n\n![](${url})\n\n`);
    changed = true;
  }
  if (!changed) {
    skipped += 1;
    continue;
  }
  // 깔끔하게 — 다중 공백/줄바꿈 1개로.
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  if (dryRun) {
    updated += 1;
    continue;
  }
  const { error } = await supa
    .from("problems")
    .update({ explanation_md: next, updated_at: new Date().toISOString() })
    .eq("problem_id", p.problem_id);
  if (error) {
    console.error(`update ${p.problem_id}: ${error.message}`);
    continue;
  }
  updated += 1;
}

console.log(`\n=== 결과 ===`);
console.log(`  updated=${updated}  skipped=${skipped}  missing_url=${missing}`);
if (missingImgs.length > 0) console.log(`  missing images: ${[...new Set(missingImgs)].sort().join(",")}`);
if (dryRun) console.log(`(dry-run — DB 변경 없음)`);

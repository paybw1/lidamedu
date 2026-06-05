// expected 해설 이미지 65건의 흰 배경 trim + .env(mcgdoplo) 로 재업로드 + DB URL 교체.
//
//   node scripts/trim-expected-images.mjs --dry-run
//   node scripts/trim-expected-images.mjs
//
// 흐름:
//   1) source/_converted/expected-image-map.json 의 URL 65개 fetch (nctokynz 또는 mcgdoplo 둘 다 200).
//   2) sharp.trim({threshold:10}) 으로 흰 여백 제거.
//   3) trim 후 sha256 → mcgdoplo storage(problem-explanations) 에 upload (멱등).
//   4) DB problems.explanation_md 안 old URL → new URL replace.
//   5) image-map JSON 도 mcgdoplo URL 로 갱신.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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
const BUCKET = "problem-explanations";

const MAP_PATH = "source/_converted/expected-image-map.json";
const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

const newMap = {};
const urlReplace = new Map(); // oldURL → newURL
let trimmed = 0, sameSize = 0, fetchFail = 0, uploadFail = 0;
const sizeStats = [];

for (const [key, oldUrl] of Object.entries(map)) {
  let buf;
  try {
    const r = await fetch(oldUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error(`fetch fail ${key}: ${e.message}`);
    fetchFail++;
    newMap[key] = oldUrl;
    continue;
  }
  const origMeta = await sharp(buf).metadata();
  const trimBuf = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  const trimMeta = await sharp(trimBuf).metadata();
  const shrunk =
    trimMeta.width !== origMeta.width || trimMeta.height !== origMeta.height;
  sizeStats.push({ key, before: `${origMeta.width}x${origMeta.height}`, after: `${trimMeta.width}x${trimMeta.height}`, b: buf.length, a: trimBuf.length, shrunk });
  if (!shrunk) {
    sameSize++;
    newMap[key] = oldUrl.replace(/\/\/[^/]+/, `//${new URL(SUPABASE_URL).host}`); // host만 정정
    continue;
  }
  trimmed++;
  const hash = createHash("sha256").update(trimBuf).digest("hex");
  const objectName = `${hash}.png`;
  if (dryRun) {
    newMap[key] = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectName}`;
    urlReplace.set(oldUrl, newMap[key]);
    continue;
  }
  const { error: upErr } = await supa.storage.from(BUCKET).upload(objectName, trimBuf, {
    contentType: "image/png", upsert: false,
  });
  if (upErr && !/duplicate/i.test(upErr.message)) {
    console.error(`upload fail ${key}: ${upErr.message}`);
    uploadFail++;
    newMap[key] = oldUrl;
    continue;
  }
  const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(objectName);
  newMap[key] = pub.publicUrl;
  urlReplace.set(oldUrl, pub.publicUrl);
}

console.log(`\n=== trim 결과 ===`);
console.log(`  trimmed=${trimmed}  same=${sameSize}  fetchFail=${fetchFail}  uploadFail=${uploadFail}`);
console.log(`상위 5건 (가장 많이 줄어든):`);
sizeStats
  .filter((s) => s.shrunk)
  .sort((a, b) => b.b / b.a - a.b / a.a)
  .slice(0, 5)
  .forEach((s) => console.log(`  ${s.key}  ${s.before} → ${s.after}  ${s.b}B → ${s.a}B`));

// DB problems.explanation_md replace.
if (!dryRun && urlReplace.size > 0) {
  const { data: probs } = await supa
    .from("problems")
    .select("problem_id, explanation_md")
    .eq("origin", "expected")
    .not("explanation_md", "is", null);
  let dbUpdated = 0;
  for (const p of probs ?? []) {
    let next = p.explanation_md;
    let changed = false;
    for (const [oldU, newU] of urlReplace) {
      if (next.includes(oldU)) {
        next = next.split(oldU).join(newU);
        changed = true;
      }
    }
    if (!changed) continue;
    const { error } = await supa.from("problems").update({ explanation_md: next, updated_at: new Date().toISOString() }).eq("problem_id", p.problem_id);
    if (!error) dbUpdated++;
  }
  console.log(`\nDB explanation_md updated: ${dbUpdated}`);
}

if (!dryRun) {
  writeFileSync(MAP_PATH, JSON.stringify(newMap, null, 2));
  console.log(`image-map 갱신: ${MAP_PATH}`);
} else {
  console.log(`\n(dry-run — DB·storage·map 변경 없음)`);
}

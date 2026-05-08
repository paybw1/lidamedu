// 단건 테스트 — Storage 안의 이미지 1개를 다운로드 → sharp trim → 새 hash 로 업로드 →
// DB problems.explanation_md 안 old URL → new URL 치환.
//
// 사용법:
//   node scripts/trim-storage-image-test.mjs <object-name>
//   예: node scripts/trim-storage-image-test.mjs f76b2fb001d6fa975451c23b60cd3d20.png

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import "dotenv/config";

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

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/trim-storage-image-test.mjs <object-name.png>");
  process.exit(1);
}

console.log(`▼ download ${target} from ${BUCKET}`);
const { data: blob, error: dlErr } = await supa.storage
  .from(BUCKET)
  .download(target);
if (dlErr) {
  console.error("download 실패:", dlErr.message);
  process.exit(1);
}
const buf = Buffer.from(await blob.arrayBuffer());
const meta = await sharp(buf).metadata();
console.log(`  original: ${meta.width}x${meta.height}, ${buf.length} bytes`);

// trim — 흰 배경 자동 제거. threshold 10 = 거의 흰색 (변환 시 anti-aliasing 잡티 허용).
const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
const tMeta = await sharp(trimmed).metadata();
console.log(`  trimmed:  ${tMeta.width}x${tMeta.height}, ${trimmed.length} bytes`);

if (
  tMeta.width === meta.width &&
  tMeta.height === meta.height
) {
  console.log("  no trim applied (이미 crop 됨 또는 흰 배경 없음).");
  process.exit(0);
}

// 새 hash → 새 object name.
const newHash = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
const newObject = `${newHash}.png`;
const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${target}`;
const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${newObject}`;

// 미리 본 결과 저장 (검증용 로컬 사본).
const previewDir = "source/_converted/trimmed-preview";
if (!existsSync(previewDir)) {
  // mkdir 동기 — 작은 단발성 사용.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(previewDir, { recursive: true });
}
writeFileSync(`${previewDir}/${newObject}`, trimmed);
console.log(`  preview: ${previewDir}/${newObject}`);

// 업로드 (이미 있으면 reuse).
const { error: upErr } = await supa.storage.from(BUCKET).upload(newObject, trimmed, {
  contentType: "image/png",
  upsert: false,
});
if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
  console.error("  upload 실패:", upErr.message);
  process.exit(1);
}
console.log(`  ${upErr ? "reused" : "uploaded"}: ${newObject}`);
console.log(`  oldUrl: ${oldUrl}`);
console.log(`  newUrl: ${newUrl}`);

// DB problems 안 old URL 사용 explanation 찾기.
const { data: probs, error: qErr } = await supa
  .from("problems")
  .select("problem_id, body_md, explanation_md")
  .ilike("explanation_md", `%${target}%`)
  .is("deleted_at", null);
if (qErr) {
  console.error("DB 조회 실패:", qErr.message);
  process.exit(1);
}
console.log(`  DB hits: ${probs?.length ?? 0}`);

let updated = 0;
for (const p of probs ?? []) {
  const before = p.explanation_md ?? "";
  const after = before.replaceAll(oldUrl, newUrl);
  if (before === after) continue;
  console.log(`    ${p.problem_id}  ${(p.body_md ?? "").slice(0, 50)}…`);
  const { error: uErr } = await supa
    .from("problems")
    .update({ explanation_md: after })
    .eq("problem_id", p.problem_id);
  if (uErr) {
    console.error(`      ✗ ${uErr.message}`);
  } else {
    updated += 1;
  }
}
console.log(`  업데이트: ${updated} 건`);

// explanation-image-map.json 도 갱신 (key 가 가리키는 url 을 newUrl 로 교체).
const MAP_PATH = "source/_converted/explanation-image-map.json";
if (existsSync(MAP_PATH)) {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  let mapChanged = false;
  for (const k of Object.keys(map)) {
    if (map[k] === oldUrl) {
      map[k] = newUrl;
      mapChanged = true;
      console.log(`  map[${k}] updated`);
    }
  }
  if (mapChanged) writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");
}

console.log("\n✓ done");

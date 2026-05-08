// soffice 로 변환한 source/_converted/wmf-png/imageN.png 들을 Supabase Storage 에 업로드.
// 기존 explanation-image-map.json 에 answer:image{N} → URL 추가 (이미 매핑된 키는 보존).
//
// 사용:
//   node scripts/upload-wmf-converted-pngs.mjs

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

const SRC_DIR = "source/_converted/wmf-png";
const MAP_PATH = "source/_converted/explanation-image-map.json";

const map = existsSync(MAP_PATH)
  ? JSON.parse(readFileSync(MAP_PATH, "utf8"))
  : {};

const files = readdirSync(SRC_DIR).filter((f) => /^image\d+\.png$/i.test(f));
console.log(`PNG 파일 ${files.length} 개`);

let uploaded = 0;
let reused = 0;
for (const f of files) {
  const m = f.match(/image(\d+)\.png/i);
  if (!m) continue;
  const idx = m[1];
  const key = `answer:image${idx}`;
  const buf = readFileSync(`${SRC_DIR}/${f}`);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const objectName = `${hash}.png`;

  const { error } = await supa.storage.from(BUCKET).upload(objectName, buf, {
    contentType: "image/png",
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.error(`  upload 실패 ${objectName}: ${error.message}`);
    continue;
  }
  if (error) reused++;
  else uploaded++;

  const { data: urlData } = supa.storage.from(BUCKET).getPublicUrl(objectName);
  map[key] = urlData.publicUrl;
  console.log(`  ${key} → ${objectName}${error ? " (reused)" : " (uploaded)"}`);
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");
console.log(`\n✓ uploaded=${uploaded}, reused=${reused}`);
console.log(`✓ ${MAP_PATH}`);

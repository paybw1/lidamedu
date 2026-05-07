// HWPX 안의 BinData/imageN.png 들을 Supabase Storage problem-explanations 버킷에 업로드.
// SHA256 hash 를 파일명으로 써서 같은 그림은 한 번만 저장 (멱등).
//
// 출력: source/_converted/explanation-image-map.json
//   { "answer:image4": "https://.../bucket/<hash>.png", "problem:image2": "..." }

import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = "problem-explanations";

const SRC = [
  { tag: "problem", path: "source/객관식 기출문제 [제20판].hwpx" },
  { tag: "answer", path: "source/[완0305+내지+해설편] 객관식(Ⅰ) 기출문제 [제20판].hwpx" },
];

const map = {}; // "tag:imageN" → public url
const cacheDir = "source/_converted/explanation-images";
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

let uploaded = 0;
let reused = 0;
let skippedWmf = 0;

for (const { tag, path } of SRC) {
  const zip = new AdmZip(path);
  const bin = zip.getEntries().filter((e) => /^BinData\/image\d+\./.test(e.entryName));
  console.log(`\n[${tag}] BinData files: ${bin.length}`);
  for (const e of bin) {
    const m = e.entryName.match(/image(\d+)\.(png|wmf|jpg|jpeg|gif)/i);
    if (!m) continue;
    const idx = m[1];
    const ext = m[2].toLowerCase();
    const key = `${tag}:image${idx}`;
    if (ext === "wmf") {
      skippedWmf++;
      console.log(`  skip wmf ${e.entryName}`);
      continue;
    }
    const buf = e.getData();
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
    const objectName = `${hash}.${ext}`;
    const localPath = `${cacheDir}/${objectName}`;
    if (!existsSync(localPath)) writeFileSync(localPath, buf);

    // upload (멱등: 같은 hash 면 skip).
    const { error } = await supa.storage.from(BUCKET).upload(objectName, buf, {
      contentType: ext === "png" ? "image/png" : `image/${ext}`,
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
}

writeFileSync("source/_converted/explanation-image-map.json", JSON.stringify(map, null, 2), "utf8");
console.log(`\n✓ uploaded=${uploaded}, reused=${reused}, skipped wmf=${skippedWmf}`);
console.log(`✓ source/_converted/explanation-image-map.json`);

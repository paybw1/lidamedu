// 예상문제 hwpx 에서 BinData/imageN.{png,wmf} 추출 후 Supabase Storage 업로드.
// WMF 는 soffice 로 PNG 변환 (LibreOffice 설치 필수).
//
// 출력: source/_converted/expected-image-map.json
//   { "answer:image6": "https://.../<hash>.png", "problem:image1": "...", ... }
//
//   node scripts/upload-expected-images.mjs
//
// 멱등: 이미 같은 hash 가 storage 에 있으면 재사용.

import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
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

// Windows LibreOffice 경로 — soffice.exe.
const SOFFICE = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

const SRC = [
  {
    tag: "problem",
    path: "source/[완0316+내지+문제편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].hwpx",
  },
  {
    tag: "answer",
    path: "source/[완0306+내지+해설편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].hwpx",
  },
];

const CACHE_DIR = "source/_converted/expected-images";
const WMF_DIR = "source/_converted/expected-images-wmf";
const PNG_DIR = "source/_converted/expected-images-png";
for (const d of [CACHE_DIR, WMF_DIR, PNG_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const MAP_PATH = "source/_converted/expected-image-map.json";
const map = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, "utf8")) : {};

let uploaded = 0;
let reused = 0;
let wmfConverted = 0;
let wmfFailed = 0;

async function uploadBuffer(buf, ext) {
  const hash = createHash("sha256").update(buf).digest("hex");
  const key = `${hash}.${ext}`;
  // 기존 객체 있나
  const { data: existing } = await supa.storage.from(BUCKET).list("", {
    search: key,
  });
  if (existing && existing.some((e) => e.name === key)) {
    reused += 1;
  } else {
    const { error } = await supa.storage.from(BUCKET).upload(key, buf, {
      contentType: ext === "png" ? "image/png" : `image/${ext}`,
      upsert: false,
    });
    if (error && !/duplicate/i.test(error.message)) {
      console.error(`upload ${key} 실패: ${error.message}`);
      return null;
    }
    if (!error) uploaded += 1;
    else reused += 1;
  }
  const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(key);
  return pub.publicUrl;
}

for (const { tag, path } of SRC) {
  const zip = new AdmZip(path);
  const bin = zip
    .getEntries()
    .filter((e) => /^BinData\/image\d+\./i.test(e.entryName));
  console.log(`\n[${tag}] BinData 이미지: ${bin.length}`);
  for (const e of bin) {
    const m = e.entryName.match(/image(\d+)\.(png|wmf|jpg|jpeg|gif)/i);
    if (!m) continue;
    const idx = m[1];
    const ext = m[2].toLowerCase();
    const mapKey = `${tag}:image${idx}`;
    if (map[mapKey]) continue;

    const buf = e.getData();

    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif") {
      const url = await uploadBuffer(buf, ext === "jpg" ? "jpeg" : ext);
      if (url) map[mapKey] = url;
    } else if (ext === "wmf") {
      // WMF → 임시 저장 → soffice 변환 → PNG 업로드.
      const wmfPath = resolve(WMF_DIR, `${tag}-image${idx}.wmf`);
      writeFileSync(wmfPath, buf);
      const outDir = resolve(PNG_DIR);
      const r = spawnSync(
        SOFFICE,
        [
          "--headless",
          "--convert-to",
          "png",
          "--outdir",
          outDir,
          wmfPath,
        ],
        { encoding: "utf8" },
      );
      if (r.status !== 0) {
        wmfFailed += 1;
        console.error(`WMF 변환 실패 ${mapKey}: ${r.stderr ?? r.error?.message}`);
        continue;
      }
      const pngPath = resolve(outDir, `${tag}-image${idx}.png`);
      if (!existsSync(pngPath)) {
        wmfFailed += 1;
        console.error(`WMF 변환 결과 없음 ${mapKey}: ${pngPath}`);
        continue;
      }
      wmfConverted += 1;
      const pngBuf = readFileSync(pngPath);
      const url = await uploadBuffer(pngBuf, "png");
      if (url) map[mapKey] = url;
    }
  }
}

writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
console.log(`\n=== 결과 ===`);
console.log(`  upload=${uploaded}  reuse=${reused}`);
console.log(`  WMF→PNG 변환: success=${wmfConverted}  fail=${wmfFailed}`);
console.log(`  map entries: ${Object.keys(map).length}`);
console.log(`  saved: ${MAP_PATH}`);

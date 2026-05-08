// 종합해설 이미지 일괄 재처리:
//   1) WMF 원본 → 300dpi A4 (2481x3508) 으로 재렌더 (LibreOffice soffice).
//   2) sharp.trim() 로 흰 배경 자동 crop.
//   3) trim 된 PNG 의 새 hash 로 Storage 업로드.
//   4) DB problems.explanation_md 안 old URL → new URL 치환.
//   5) source/_converted/explanation-image-map.json 갱신.
//
// WMF 가 없는 ref (예: native PNG image14) 는 Storage 에서 다운로드해 trim 만 적용.
//
// 사용:
//   node scripts/reprocess-explanation-images.mjs              # dry-run (Storage 업로드 + DB 업데이트 안 함)
//   node scripts/reprocess-explanation-images.mjs --apply      # 실제 적용

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
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
const SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe";

const APPLY = process.argv.includes("--apply");

const WMF_SRC = "source/_converted/wmf-src";
const HIRES_DIR = "source/_converted/wmf-png-hires";
const TRIM_DIR = "source/_converted/img-trimmed";
const MAP_PATH = "source/_converted/explanation-image-map.json";

if (!existsSync(HIRES_DIR)) mkdirSync(HIRES_DIR, { recursive: true });
if (!existsSync(TRIM_DIR)) mkdirSync(TRIM_DIR, { recursive: true });

const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

// 1) WMF 일괄 300dpi 재렌더 (한 번에 처리하면 빠름).
const wmfFiles = readdirSync(WMF_SRC).filter((f) => /^image\d+\.wmf$/i.test(f));
console.log(`▼ WMF ${wmfFiles.length}개 → 300dpi A4 재렌더`);
const filterArg =
  'png:draw_png_Export:{"PixelWidth":{"type":"long","value":"2481"},"PixelHeight":{"type":"long","value":"3508"}}';
// soffice 가 한 번에 여러 파일 처리.
execFileSync(
  SOFFICE,
  ["--headless", "--convert-to", filterArg, "--outdir", HIRES_DIR, ...wmfFiles.map((f) => `${WMF_SRC}/${f}`)],
  { stdio: "inherit" },
);

// 2) 처리 대상 ref 결정 — explanation-image-map.json 의 모든 키.
const refs = Object.keys(map).filter((k) => k.startsWith("answer:")); // problem:* 는 DB 미사용.
console.log(`▼ ${refs.length} refs 처리`);

const replacements = []; // { ref, oldUrl, newUrl }
for (const ref of refs) {
  const m = ref.match(/^answer:image(\d+)$/);
  if (!m) continue;
  const idx = m[1];
  const oldUrl = map[ref];
  if (!oldUrl) continue;
  const oldFile = oldUrl.split("/").pop();

  let buf = null;
  const wmfRender = `${HIRES_DIR}/image${idx}.png`;
  if (existsSync(wmfRender)) {
    buf = readFileSync(wmfRender);
  } else {
    // WMF 원본 없음 → Storage 에서 현재 파일 다운로드.
    const { data: blob, error } = await supa.storage.from(BUCKET).download(oldFile);
    if (error) {
      console.warn(`  ${ref} (download skip): ${error.message}`);
      continue;
    }
    buf = Buffer.from(await blob.arrayBuffer());
  }

  const beforeMeta = await sharp(buf).metadata();
  const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  const afterMeta = await sharp(trimmed).metadata();
  writeFileSync(`${TRIM_DIR}/${ref.replace(":", "_")}.png`, trimmed);

  const newHash = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
  const newObject = `${newHash}.png`;
  const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${newObject}`;

  const dimChange = `${beforeMeta.width}x${beforeMeta.height} → ${afterMeta.width}x${afterMeta.height}`;
  if (newObject === oldFile) {
    console.log(`  ${ref}: no change (${dimChange})`);
    continue;
  }

  if (APPLY) {
    const { error } = await supa.storage.from(BUCKET).upload(newObject, trimmed, {
      contentType: "image/png",
      upsert: false,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.error(`  ${ref} upload 실패: ${error.message}`);
      continue;
    }
  }
  console.log(`  ${ref}: ${dimChange}  ${oldFile.slice(0, 12)}… → ${newObject.slice(0, 12)}…`);
  replacements.push({ ref, oldUrl, newUrl, oldFile, newObject });
  map[ref] = newUrl;
}

// 3) DB 업데이트 — 각 oldUrl 을 newUrl 로 치환.
console.log(`\n▼ DB 업데이트 (${replacements.length} refs)`);
let updatedRows = 0;
for (const r of replacements) {
  const { data: probs, error } = await supa
    .from("problems")
    .select("problem_id, body_md, explanation_md")
    .ilike("explanation_md", `%${r.oldFile}%`)
    .is("deleted_at", null);
  if (error) {
    console.error(`  ${r.ref} 조회 실패: ${error.message}`);
    continue;
  }
  for (const p of probs ?? []) {
    const before = p.explanation_md ?? "";
    const after = before.replaceAll(r.oldUrl, r.newUrl);
    if (before === after) continue;
    if (APPLY) {
      const { error: uErr } = await supa
        .from("problems")
        .update({ explanation_md: after })
        .eq("problem_id", p.problem_id);
      if (uErr) {
        console.error(`    ✗ ${p.problem_id} ${uErr.message}`);
        continue;
      }
    }
    console.log(`    ${r.ref} → ${p.problem_id} (${(p.body_md ?? "").slice(0, 40)}…)`);
    updatedRows += 1;
  }
}

// 4) 맵 갱신.
if (APPLY && replacements.length > 0) {
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");
  console.log(`\n✓ ${MAP_PATH} 갱신`);
}

console.log(`\n결과: ${replacements.length} refs 변경, DB ${updatedRows} 행 업데이트`);
if (!APPLY) console.log("dry-run — 적용하려면 --apply");

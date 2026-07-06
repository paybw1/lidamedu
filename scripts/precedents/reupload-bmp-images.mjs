// BMP 소스 이미지 재변환·재업로드 (1회성 핫픽스)
//   bmp-js 가 24비트 BMP 알파를 0 으로 디코드 → 기존 업로드분이 전면 투명(백지).
//   같은 storagePath 로 upsert — URL 불변이라 DB 무수정.
//   대상: 상표 판례 images 중 storagePath 가 tm16-{binId}.webp 이고 원본이 .BMP 인 것 전부.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import sharp from "sharp";
import bmp from "bmp-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const zip = new AdmZip("source/상표업로드/판례.hwpx");
const binByStem = new Map();
for (const e of zip.getEntries()) {
  const m = /^BinData\/([^.]+)\.(\w+)$/.exec(e.entryName);
  if (m) binByStem.set(m[1].toLowerCase(), { entry: e, ext: m[2].toLowerCase() });
}

async function bmpToWebp(buf) {
  const decoded = bmp.decode(buf);
  const px = decoded.data;
  let hasAlpha = false;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] !== 0) {
      hasAlpha = true;
      break;
    }
  }
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i], b = px[i + 1], g = px[i + 2], r = px[i + 3];
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = hasAlpha ? a : 255;
  }
  return sharp(px, { raw: { width: decoded.width, height: decoded.height, channels: 4 } })
    .webp({ quality: 88 })
    .toBuffer();
}

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, images")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;

let done = 0, skip = 0, fail = 0;
const converted = new Set(); // 같은 binId 가 두 판례에 공유돼도 storagePath 는 판례별 — 각각 업로드
for (const r of rows) {
  for (const img of r.images ?? []) {
    const m = /tm16-([^./]+)\.webp$/.exec(img.storagePath ?? "");
    if (!m) continue;
    const hit = binByStem.get(m[1].toLowerCase());
    if (!hit || hit.ext !== "bmp") {
      skip++;
      continue;
    }
    try {
      const buf = await bmpToWebp(hit.entry.getData());
      const { error: upErr } = await sb.storage
        .from("case-images")
        .upload(img.storagePath, buf, { contentType: "image/webp", upsert: true });
      if (upErr) throw new Error(upErr.message);
      done++;
      converted.add(m[1]);
    } catch (e) {
      fail++;
      console.log(`! ${r.case_number} ${m[1]}: ${e.message}`);
    }
  }
}
console.log(`재업로드 ${done} (고유 BMP ${converted.size}) / 비BMP skip ${skip} / 실패 ${fail}`);

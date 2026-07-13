// 학원시설 사진 최적화(sharp resize 1600·q78) + facility-photos 버킷 업로드(공개).
//   원본은 source/학원소개/{1..9}.jpg. 파일명 그대로 업로드(upsert).
//   node scripts/upload-facility-photos.mjs
import { readdirSync } from "node:fs";
import "dotenv/config";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const SRC = "C:/project/lidamedu/source/학원소개";
const BUCKET = "facility-photos";
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const files = readdirSync(SRC)
  .filter((f) => /^\d+\.jpg$/i.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b));
console.log("files:", files.join(", "));
for (const f of files) {
  const buf = await sharp(`${SRC}/${f}`)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  const { error } = await db.storage
    .from(BUCKET)
    .upload(f, buf, { contentType: "image/jpeg", upsert: true });
  console.log(
    `${f}: ${(buf.length / 1024).toFixed(0)}KB ${error ? "ERR " + error.message : "OK"}`,
  );
}
console.log("done.");

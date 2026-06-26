// 재크롭한 그림을 storage 에 덮어쓴다(upsert). .env supabase-js(service_role) = 운영 mcgdoplo.
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing SUPABASE_URL / SERVICE_ROLE_KEY");
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} is not prod(mcgdoplo)`);
const sb = createClient(url, key);

// 재크롭 대상 (전수 비전 점검 결과 — 하단 선지/발문 혼입).
const files = [
  ["2022_physics", "q04.png"],
  ["2025_physics", "q01.png"],
  ["2019_earth_science", "q39.png"],
];

for (const [dir, file] of files) {
  const local = `.tmp-audit/recrop/${dir}__${file}`;
  const buf = fs.readFileSync(local);
  const objPath = `past-exam-figure/${dir}/${file}`;
  const { error } = await sb.storage
    .from("problem-images")
    .upload(objPath, buf, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) console.log("ERR", objPath, error.message);
  else console.log("uploaded", objPath, buf.length, "bytes");
}
console.log("done");

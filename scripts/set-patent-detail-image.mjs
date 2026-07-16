// 특허법 기본강의 2026(patent_basic_2026) 상세 이미지 테스트 주입.
//   테스트 SVG → landing-banners 버킷 업로드 → subscription_plans.detail_image_url 설정.
//   실행: npx dotenv -e .env -- node scripts/set-patent-detail-image.mjs
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const admin = createClient(url, key);

const svg = readFileSync(new URL("./assets/patent-detail-test.svg", import.meta.url));
const path = "product-details/patent_basic_2026_test.svg";

const { error: upErr } = await admin.storage
  .from("landing-banners")
  .upload(path, svg, { contentType: "image/svg+xml", upsert: true });
if (upErr) {
  console.error("업로드 실패:", upErr.message);
  process.exit(1);
}
const publicUrl = admin.storage.from("landing-banners").getPublicUrl(path).data
  .publicUrl;

const { error: updErr, count } = await admin
  .from("subscription_plans")
  .update({ detail_image_url: publicUrl, detail_html: null }, { count: "exact" })
  .eq("code", "patent_basic_2026");
if (updErr) {
  console.error("업데이트 실패:", updErr.message);
  process.exit(1);
}
console.log("OK", { publicUrl, updated: count });

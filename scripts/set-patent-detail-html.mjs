// 특허법 기본강의 2026(patent_basic_2026) 상세 HTML 테스트 주입.
//   detail_html 설정 + detail_image_url 제거(HTML 모드로 전환).
//   실행: npx dotenv -e .env -- node scripts/set-patent-detail-html.mjs
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const admin = createClient(url, key);

const html = readFileSync(
  new URL("./assets/patent-detail-test.html", import.meta.url),
  "utf8",
);

const { error, count } = await admin
  .from("subscription_plans")
  .update({ detail_html: html, detail_image_url: null }, { count: "exact" })
  .eq("code", "patent_basic_2026");
if (error) {
  console.error("업데이트 실패:", error.message);
  process.exit(1);
}
console.log("OK", { updated: count, htmlBytes: html.length });

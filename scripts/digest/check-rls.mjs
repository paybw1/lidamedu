// 정리비교표 노출 확인 — 비로그인(anon)에게는 0건이어야 한다.
//   node scripts/digest/check-rls.mjs
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const anon = createClient(url, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const a = await anon.from("systematic_digests").select("page");
const s = await admin.from("systematic_digests").select("page");
console.log(`비로그인: ${a.data?.length ?? 0}건 ${a.error ? `(${a.error.message})` : ""}`);
console.log(`service_role: ${s.data?.length ?? 0}건`);
console.log(
  (a.data?.length ?? 0) === 0 && (s.data?.length ?? 0) >= 14 /* 12쪽 → 9p·11p 를 둘로 갈라 14장(2026-09-10) */
    ? "정상 — 비로그인(anon)에게는 막혀 있습니다(2026-09-11부터 로그인 사용자는 읽기 허용)."
    : "★확인 필요",
);

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
  (a.data?.length ?? 0) === 0 && (s.data?.length ?? 0) === 12
    ? "정상 — staff 전용으로 막혀 있습니다."
    : "★확인 필요",
);

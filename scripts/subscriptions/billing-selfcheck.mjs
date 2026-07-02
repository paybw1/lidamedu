// 자동결제/구독 셀프 점검 — 특정 사용자의 빌링키·구독·최근 결제를 한눈에 출력.
// feat-8-028 Stage 5 테스트 보조. 운영 DB(.env supabase-js, service_role) 조회 전용(읽기).
//
// 사용:
//   node scripts/subscriptions/billing-selfcheck.mjs <이메일 또는 user_id>
//   node scripts/subscriptions/billing-selfcheck.mjs paybw1@gmail.com
//   node scripts/subscriptions/billing-selfcheck.mjs 8dbc9c0e-....(uuid)

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const arg = process.argv[2];
if (!arg) {
  console.error("사용법: node scripts/subscriptions/billing-selfcheck.mjs <이메일 또는 user_id>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUser(input) {
  if (UUID_RE.test(input)) {
    const { data } = await db.auth.admin.getUserById(input);
    return { id: input, email: data?.user?.email ?? "(?)" };
  }
  // 이메일 → user_id (auth.admin.listUsers 페이지네이션 검색)
  const target = input.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email };
    if (!data || data.users.length < 1000) break;
  }
  return null;
}

function fmt(ts) {
  return ts ? String(ts).slice(0, 19).replace("T", " ") : "—";
}

async function main() {
  const user = await resolveUser(arg);
  if (!user) {
    console.error(`사용자를 찾지 못했습니다: ${arg}`);
    process.exit(1);
  }
  const { data: prof } = await db
    .from("profiles")
    .select("name, nickname")
    .eq("profile_id", user.id)
    .maybeSingle();

  console.log("\n══════════════════════════════════════════════");
  console.log(` 사용자  : ${prof?.name ?? prof?.nickname ?? "(이름없음)"}  <${user.email}>`);
  console.log(` user_id : ${user.id}`);
  console.log("══════════════════════════════════════════════");

  // 1) 빌링키(자동결제 카드)
  const { data: keys } = await db
    .from("billing_keys")
    .select("card_company, card_number_masked, created_at, deleted_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  console.log("\n[ 자동결제 카드(billing_keys) ]");
  if (!keys?.length) console.log("  (없음 — 자동결제 미등록)");
  else
    for (const k of keys) {
      const alive = k.deleted_at ? "해지됨" : "활성";
      console.log(`  · ${k.card_company ?? "?"} ${k.card_number_masked ?? ""}  [${alive}]  등록 ${fmt(k.created_at)}`);
    }

  // 2) 구독
  const { data: subs } = await db
    .from("user_subscriptions")
    .select("status, auto_renew, started_at, expires_at, cancelled_at, subject_code, subscription_plans!inner(name)")
    .eq("user_id", user.id)
    .order("expires_at", { ascending: false })
    .limit(10);
  console.log("\n[ 구독(user_subscriptions) 최근 10 ]");
  if (!subs?.length) console.log("  (없음)");
  else
    for (const s of subs) {
      const auto = s.auto_renew ? "자동갱신 ON" : "자동갱신 off";
      const cancel = s.cancelled_at ? ` · 해지 ${fmt(s.cancelled_at)}` : "";
      console.log(
        `  · ${s.subscription_plans.name}${s.subject_code ? `(${s.subject_code})` : ""}  [${s.status}]  ${auto}${cancel}`,
      );
      console.log(`      기간 ${fmt(s.started_at)} → ${fmt(s.expires_at)}`);
    }

  // 3) 결제 이력
  const { data: pays } = await db
    .from("payments")
    .select("created_at, amount_krw, status, refunded_at, refund_amount_krw, subscription_plans!inner(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\n[ 결제 이력(payments) 최근 10 ]");
  if (!pays?.length) console.log("  (없음)");
  else
    for (const p of pays) {
      const refund = p.refunded_at ? ` · 환불 ${fmt(p.refunded_at)}(₩${(p.refund_amount_krw ?? 0).toLocaleString("ko-KR")})` : "";
      console.log(
        `  · ${fmt(p.created_at)}  ${p.subscription_plans.name}  ₩${p.amount_krw.toLocaleString("ko-KR")}  [${p.status}]${refund}`,
      );
    }
  console.log("");
}

main().catch((e) => {
  console.error("오류:", e.message ?? e);
  process.exit(1);
});

// feat-11-010 — 수강기간 연장 서버 경로 실주행 점검 (2026-09-02).
//
// 브라우저 결제창을 뺀 **나머지 전부**를 실제 코드로 돌린다:
//   정책 해석 → 주문 생성 → (결제 성공 가정) 적용 → 멱등 → 환불 원복.
// ★테스트용 수강권을 만들어 쓰고 끝나면 지운다. 실사용자 데이터는 건드리지 않는다.
//
//   node --import tsx scripts/lms/test-extension-flow.mjs          # 실행 + 정리
//   node --import tsx scripts/lms/test-extension-flow.mjs --keep   # 정리 없이 남김
import "dotenv/config";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getCourseExtensionDefaults } from "~/core/lib/app-settings.server";
import {
  applyEnrollmentExtension,
  createExtensionOrder,
  listExtensionHistory,
  resolveExtensionForEnrollment,
  revertEnrollmentExtension,
} from "~/features/lms/extension.server";

const KEEP = process.argv.includes("--keep");
const DAY = 86_400_000;
const NOTE = "feat-11-010 연장 흐름 점검(자동 생성)";

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const d = (iso) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");
// ★타임스탬프는 문자열이 아니라 시각으로 비교한다 — Postgres 는 마이크로초까지 돌려줘
//   toISOString()(밀리초)과 문자열이 절대 같지 않다.
const sameInstant = (a, b) =>
  a != null && b != null && Date.parse(a) === Date.parse(b);

const defaults = await getCourseExtensionDefaults(adminClient);
console.log("연장 기본값:", defaults, "\n");

// 대상 상품 — 온라인 단과(course) 중 연장 가능한 것.
const { data: plan } = await adminClient
  .from("subscription_plans")
  .select("plan_id, name, product_kind")
  .eq("product_kind", "course")
  .limit(1)
  .maybeSingle();
if (!plan) throw new Error("product_kind=course 상품이 없습니다");
const { data: link } = await adminClient
  .from("plan_courses")
  .select("course_id")
  .eq("plan_id", plan.plan_id)
  .limit(1)
  .maybeSingle();
if (!link) throw new Error(`${plan.name} 에 연결된 강의가 없습니다`);
const { data: admin } = await adminClient
  .from("profiles")
  .select("profile_id, name")
  .eq("role", "admin")
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (!admin) throw new Error("admin 계정이 없습니다");
console.log(`상품: ${plan.name} / 대상 계정: ${admin.name}\n`);

const created = [];
async function makeEnrollment(expiresAt) {
  const { data, error } = await adminClient
    .from("enrollments")
    .insert({
      user_id: admin.profile_id,
      course_id: link.course_id,
      plan_id: plan.plan_id,
      source: "manual",
      admin_note: NOTE,
      expires_at: expiresAt.toISOString(),
    })
    .select("enrollment_id")
    .single();
  if (error) throw new Error(`수강권 생성 실패: ${error.message}`);
  created.push(data.enrollment_id);
  return data.enrollment_id;
}
const expiresOf = async (id) => {
  const { data } = await adminClient
    .from("enrollments")
    .select("expires_at")
    .eq("enrollment_id", id)
    .maybeSingle();
  return data?.expires_at ?? null;
};

async function runOnce(label, expiresAt, expectedNext) {
  console.log(`\n■ ${label}`);
  const id = await makeEnrollment(expiresAt);
  const ctx = await resolveExtensionForEnrollment({
    enrollmentId: id,
    userId: admin.profile_id,
    defaults,
  });
  check("정책 해석 — 연장 가능", ctx?.offer.ok === true, ctx?.offer.reason ?? "");
  if (!ctx?.offer.ok) return null;
  check(
    "예상 만료일 계산",
    ctx.offer.nextExpiresAt.slice(0, 10) === expectedNext,
    `${d(ctx.offer.nextExpiresAt)} (기대 ${expectedNext})`,
  );

  const order = await createExtensionOrder({ userId: admin.profile_id, ctx });
  check("주문 생성", Boolean(order.orderItemId), `${order.amountKrw}원`);
  const beforeApply = await expiresOf(id);
  check(
    "결제 전에는 수강기간 불변",
    sameInstant(beforeApply, expiresAt.toISOString()),
    d(beforeApply),
  );

  // 결제 성공 가정 — 지급 단계가 부르는 함수를 그대로 호출.
  const applyArgs = {
    orderItemId: order.orderItemId,
    userId: admin.profile_id,
    enrollmentId: id,
    planId: plan.plan_id,
    amountKrw: order.amountKrw,
    defaults,
  };
  await applyEnrollmentExtension(applyArgs);
  const afterApply = await expiresOf(id);
  check(
    "연장 적용 — 만료일 변경",
    afterApply?.slice(0, 10) === expectedNext,
    d(afterApply),
  );

  // 멱등 — 웹훅·confirm 이중 호출.
  await applyEnrollmentExtension(applyArgs);
  const afterTwice = await expiresOf(id);
  const { count } = await adminClient
    .from("enrollment_extensions")
    .select("extension_id", { count: "exact", head: true })
    .eq("enrollment_id", id);
  check("이중 호출 — 만료일 그대로", sameInstant(afterTwice, afterApply), d(afterTwice));
  check("이중 호출 — 이력 1건", count === 1, `${count}건`);

  return { id, orderItemId: order.orderItemId, expiresAt, afterApply };
}

// ── 시나리오 ①: 수강 중 — 종료일 뒤에 누적 ─────────────────────────────
const now = new Date();
const inTen = new Date(now.getTime() + 10 * DAY);
const expect1 = new Date(inTen.getTime() + defaults.days * DAY)
  .toISOString()
  .slice(0, 10);
const r1 = await runOnce("수강 중 연장", inTen, expect1);

// ── 시나리오 ②: 종료 후 5일 — 내일 0시(KST)부터 N일 ───────────────────
const kst = new Date(now.getTime() + 9 * 3600_000);
const nextKstMidnight = new Date(
  Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) -
    9 * 3600_000,
);
const expect2 = new Date(nextKstMidnight.getTime() + defaults.days * DAY)
  .toISOString()
  .slice(0, 10);
const r2 = await runOnce(
  "종료 후 5일 — 결제 당일 미포함",
  new Date(now.getTime() - 5 * DAY),
  expect2,
);

// ── 환불 원복 ───────────────────────────────────────────────────────────
if (r1) {
  console.log("\n■ 환불 원복 (아직 쓰지 않은 연장)");
  await revertEnrollmentExtension(r1.orderItemId, "테스트 환불");
  const back = await expiresOf(r1.id);
  check(
    "만료일이 원래대로",
    sameInstant(back, r1.expiresAt.toISOString()),
    `${d(back)} (원래 ${d(r1.expiresAt.toISOString())})`,
  );
  const ctx = await resolveExtensionForEnrollment({
    enrollmentId: r1.id,
    userId: admin.profile_id,
    defaults,
  });
  check("원복 후 연장 횟수 복구", ctx?.offer.usedCount === 0, `used=${ctx?.offer.usedCount}`);
}

// ── 이력 조회 ───────────────────────────────────────────────────────────
console.log("\n■ 이력 화면 쿼리");
const history = await listExtensionHistory(20);
const mine = history.filter((h) => created.includes(h.enrollmentId));
check("이력 조회", mine.length >= 2, `${mine.length}건`);
for (const h of mine) {
  console.log(
    `     ${h.memberName}#${h.memberNo} · ${h.courseLabel} · ${h.prevExpiresAt.slice(0, 10)} → ${h.nextExpiresAt.slice(0, 10)} · ${h.daysAdded}일 · ${h.amountKrw}원 · ${h.seq}회차 · ${h.status}${h.needsManual ? " · 수동필요" : ""}`,
  );
}

// ── 정리 ────────────────────────────────────────────────────────────────
if (!KEEP) {
  console.log("\n■ 정리");
  const { data: exts } = await adminClient
    .from("enrollment_extensions")
    .select("extension_id, order_item_id")
    .in("enrollment_id", created);
  const orderItemIds = (exts ?? []).map((e) => e.order_item_id).filter(Boolean);
  await adminClient
    .from("enrollment_extensions")
    .delete()
    .in("enrollment_id", created);
  if (orderItemIds.length) {
    const { data: its } = await adminClient
      .from("order_items")
      .select("order_id")
      .in("order_item_id", orderItemIds);
    await adminClient.from("order_items").delete().in("order_item_id", orderItemIds);
    const orderIds = [...new Set((its ?? []).map((i) => i.order_id))];
    if (orderIds.length) {
      await adminClient.from("payments").delete().in("order_id", orderIds);
      await adminClient.from("orders").delete().in("order_id", orderIds);
    }
  }
  await adminClient.from("enrollment_admin_logs").delete().in("enrollment_id", created);
  await adminClient.from("enrollments").delete().in("enrollment_id", created);
  console.log(`  테스트 수강권 ${created.length}건 · 주문·이력 정리 완료`);
} else {
  console.log(`\n[--keep] 테스트 수강권 남김: ${created.join(", ")}`);
}

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);

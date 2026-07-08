// feat-11-004 4d — 쿠폰 개인 발급(자동 발급 포함)·사용 마킹.
// 정의부 SSOT=discounts(auto_issue 컬럼). 발급 쿠폰 사용은 기존 체크아웃 code 입력 흐름 재사용 —
// 결제 완료 시 discount_id ↔ user_coupons 매칭으로 used_at 마킹.

import adminClient from "~/core/lib/supa-admin-client.server";

/** 트리거 기반 자동 발급 — 가입(signup)/첫 구매(first_purchase). 멱등(unique user+discount). */
export async function issueAutoCoupons(
  userId: string,
  trigger: "signup" | "first_purchase",
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: defs } = await adminClient
    .from("discounts")
    .select("discount_id, ends_at")
    .eq("auto_issue", trigger)
    .eq("is_active", true)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`);
  let issued = 0;
  for (const d of defs ?? []) {
    const { error } = await adminClient.from("user_coupons").insert({
      user_id: userId,
      discount_id: d.discount_id,
      issued_reason: trigger,
      expires_at: d.ends_at,
    });
    if (!error) issued++;
    else if (error.code !== "23505") {
      console.error("[coupons] auto issue failed:", error.message);
    }
  }
  return issued;
}

/** 결제 완료 훅 — 사용 마킹 + 첫 구매 자동 발급. markOrderPaidAndFulfill 이 호출. */
export async function onOrderPaidCouponHooks(order: {
  orderId: string;
  userId: string;
  discountId: string | null;
}): Promise<void> {
  // 1) 이 주문에 적용된 할인의 발급 쿠폰 사용 마킹(있으면)
  if (order.discountId) {
    await adminClient
      .from("user_coupons")
      .update({ used_at: new Date().toISOString(), order_id: order.orderId })
      .eq("user_id", order.userId)
      .eq("discount_id", order.discountId)
      .is("used_at", null);
  }
  // 2) 첫 구매 자동 발급 — 이 주문 외 paid 이력이 없으면
  const { count } = await adminClient
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("user_id", order.userId)
    .in("status", ["paid", "partially_refunded", "refunded"])
    .neq("order_id", order.orderId);
  if ((count ?? 0) === 0) {
    await issueAutoCoupons(order.userId, "first_purchase");
  }
}

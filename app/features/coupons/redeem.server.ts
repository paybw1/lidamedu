// feat-13 쿠폰 발급 + 체크아웃 적용 — 서버 권위 검증·계산·사용 기록.
// coupons 는 RLS staff 전용이라 학생 흐름은 전부 adminClient 로 읽는다(본인 스코프 검증 포함).
import adminClient from "~/core/lib/supa-admin-client.server";

import { type CartLineForCoupon, couponScopeTokens } from "./labels";

export type { CartLineForCoupon } from "./labels";

// KST(UTC+9) 기준 오늘 yyyy-mm-dd — 유효기간(date 컬럼) 비교용.
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export type ResolveCouponOk = {
  ok: true;
  couponId: string;
  name: string;
  discountKrw: number; // 적용 할인액(원)
  eligibleKrw: number; // 범위 내 대상 금액(원)
};
export type ResolveCouponResult = ResolveCouponOk | { ok: false; error: string };

/**
 * 장바구니 쿠폰 코드 검증 + 할인액 계산(서버 권위). 결제 요청·미리보기 양쪽에서 호출.
 * 할인은 "범위(scope) 내 대상 금액(eligibleKrw)"을 기준으로 계산한다(부분 적용).
 */
export async function resolveCartCoupon(input: {
  userId: string;
  code: string;
  lines: CartLineForCoupon[];
}): Promise<ResolveCouponResult> {
  const code = input.code.trim();
  if (!code) return { ok: false, error: "쿠폰 코드를 입력해 주세요." };

  const { data: c } = await adminClient
    .from("coupons")
    .select("*")
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!c) return { ok: false, error: "존재하지 않는 쿠폰입니다." };
  if (c.status !== "active")
    return { ok: false, error: "사용할 수 없는 쿠폰입니다." };

  const today = kstToday();
  if (today < c.valid_from) return { ok: false, error: "아직 사용 기간이 아닙니다." };
  if (today > c.valid_to) return { ok: false, error: "사용 기간이 지난 쿠폰입니다." };

  // 범위 내 대상 금액
  const tokens = new Set(couponScopeTokens(c.scope));
  const eligibleKrw = input.lines
    .filter((l) => tokens.has(l.kind))
    .reduce((s, l) => s + l.amountKrw, 0);
  if (eligibleKrw <= 0)
    return { ok: false, error: "이 쿠폰을 적용할 수 있는 상품이 없습니다." };
  if (eligibleKrw < c.min_amount)
    return {
      ok: false,
      error: `${c.min_amount.toLocaleString("ko-KR")}원 이상 결제 시 사용할 수 있습니다.`,
    };

  // 개별(비공용) 쿠폰 — 발급받은 회원만, 유효기간 내
  if (!c.is_shared) {
    const { data: grant } = await adminClient
      .from("coupon_grants")
      .select("expires_at, revoked_at")
      .eq("coupon_id", c.coupon_id)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!grant || grant.revoked_at)
      return { ok: false, error: "발급받지 않은 쿠폰입니다." };
    if (grant.expires_at && grant.expires_at < new Date().toISOString())
      return { ok: false, error: "발급받은 쿠폰의 사용 기간이 지났습니다." };
  }

  // 1인 1회
  const { data: mine } = await adminClient
    .from("coupon_redemptions")
    .select("redemption_id")
    .eq("coupon_id", c.coupon_id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (mine) return { ok: false, error: "이미 사용한 쿠폰입니다." };

  // 발행수 총량 상한(issue_count>0 일 때만)
  if (c.issue_count > 0) {
    const { count } = await adminClient
      .from("coupon_redemptions")
      .select("redemption_id", { count: "exact", head: true })
      .eq("coupon_id", c.coupon_id);
    if ((count ?? 0) >= c.issue_count)
      return { ok: false, error: "쿠폰이 모두 소진되었습니다." };
  }

  // 할인액 계산 — 대상 금액 초과·최대 할인 상한 적용
  let discountKrw: number;
  if (c.discount_type === "percent") {
    discountKrw = Math.floor((eligibleKrw * c.discount_value) / 100);
    if (c.max_discount != null) discountKrw = Math.min(discountKrw, c.max_discount);
  } else {
    discountKrw = c.discount_value;
  }
  discountKrw = Math.min(discountKrw, eligibleKrw);
  if (discountKrw <= 0)
    return { ok: false, error: "적용 가능한 할인이 없습니다." };

  return {
    ok: true,
    couponId: c.coupon_id,
    name: c.name,
    discountKrw,
    eligibleKrw,
  };
}

/**
 * 결제 완료 훅 — 주문에 적용된 쿠폰의 사용 이력 기록(멱등). markOrderPaidAndFulfill 이 호출.
 * unique(coupon_id, user_id) 로 중복 방지 — 재호출 시 23505 무시.
 */
export async function onOrderPaidCouponRedeem(order: {
  orderId: string;
  userId: string;
  couponId: string | null;
  couponDiscountKrw: number | null;
}): Promise<void> {
  if (!order.couponId) return;
  const { error } = await adminClient.from("coupon_redemptions").insert({
    coupon_id: order.couponId,
    user_id: order.userId,
    order_id: order.orderId,
    discount_krw: order.couponDiscountKrw ?? 0,
  });
  if (error && error.code !== "23505") {
    console.error("[coupons] redemption record failed:", error.message);
  }
}

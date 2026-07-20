// feat-11 장바구니(C1) — 다건 체크아웃. 강의(plan: course/tpass)·도서(book) 혼합 주문 생성 +
// 주문 단위 pending 결제 → 토스 orderId 반환. 클라가 받은 orderId 로 토스 SDK 결제.
// ★서버 권위 금액(클라 가격 불신). 항목 재해석은 resolveCartItems 공용 헬퍼.
// feat-13 — 쿠폰 코드(선택)를 서버에서 재검증(resolveCartCoupon)해 총액에서 차감.
import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCartCoupon } from "~/features/coupons/redeem.server";
import {
  type RawCartItem,
  resolveCartItems,
} from "~/features/orders/cart-resolve.server";
import { createCartOrder } from "~/features/orders/orders.server";
import { createPendingCartPayment } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/create-cart-order";

const itemSchema = z.union([
  z.object({ kind: z.literal("plan"), code: z.string().min(1).max(40) }),
  z.object({
    kind: z.literal("book"),
    bookId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  }),
  z.object({ kind: z.literal("bundle"), bundleId: z.string().uuid() }),
]);
const schema = z.object({
  items: z.array(itemSchema).min(1).max(50),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다" }, { status: 401 });

  const fd = await request.formData();
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return data({ error: "장바구니 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const parsed = schema.safeParse({ items: rawItems });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "장바구니가 비어 있습니다" },
      { status: 400 },
    );
  }

  const resolved = await resolveCartItems(
    client,
    user.id,
    parsed.data.items as RawCartItem[],
  );
  if (!resolved.ok) return data({ error: resolved.error }, { status: resolved.status });

  // 쿠폰(선택) — 서버 권위 재검증 후 할인 확정. 유효하지 않으면 결제 자체를 막는다.
  const couponCode = String(fd.get("couponCode") ?? "").trim();
  let couponId: string | null = null;
  let couponDiscountKrw = 0;
  if (couponCode) {
    const c = await resolveCartCoupon({
      userId: user.id,
      code: couponCode,
      lines: resolved.couponLines,
    });
    if (!c.ok) return data({ error: c.error }, { status: 400 });
    couponId = c.couponId;
    couponDiscountKrw = c.discountKrw;
  }

  const order = await createCartOrder({
    userId: user.id,
    items: resolved.items,
    shippingFeeKrw: resolved.shippingFeeKrw,
    couponId,
    couponDiscountKrw,
  });
  if (order.totalKrw <= 0)
    return data({ error: "결제 금액이 0원입니다" }, { status: 400 });

  const tossOrderId = `lidam-${randomUUID()}`;
  const res = await createPendingCartPayment({
    userId: user.id,
    tossOrderId,
    amountKrw: order.totalKrw,
    orderId: order.orderId,
  });
  if (!res.ok) return data({ error: res.error }, { status: 500 });

  const orderName =
    resolved.names.length === 1
      ? resolved.names[0]
      : `${resolved.names[0]} 외 ${resolved.names.length - 1}건`;
  return data({
    ok: true,
    orderId: tossOrderId,
    amount: order.totalKrw,
    orderName,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

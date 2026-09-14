// feat-11 장바구니(C1) — 다건 체크아웃. 강의(plan: course/tpass)·도서(book) 혼합 주문 생성 +
// 주문 단위 pending 결제 → 토스 orderId 반환. 클라가 받은 orderId 로 토스 SDK 결제.
// ★서버 권위 금액(클라 가격 불신). 항목 재해석은 resolveCartItems 공용 헬퍼.
// feat-13 — 쿠폰 코드(선택)를 서버에서 재검증(resolveCartCoupon)해 총액에서 차감.
//
// ★feat-11-012 P5-d·P5-e — 이 액션이 **결제 개시의 단일 진입점**이다.
//   결제수단(카드/무통장)이 갈라져도 항목 재해석·재고·구매한도·쿠폰 검증은 **한 벌**이어야
//   「화면엔 되는데 결제는 거절」이 안 생긴다(D6 과 같은 이유). 그래서 무통장용 라우트를
//   따로 파지 않고 method 를 받는다. 갈라지는 것은 마지막 한 걸음뿐이다 —
//   토스면 pending 결제 + 토스 orderId, 무통장이면 입금 대기 + 기한.
import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCartCoupon } from "~/features/coupons/redeem.server";
import {
  type RawCartItem,
  resolveCartItems,
} from "~/features/orders/cart-resolve.server";
import { createBankTransferCartOrder } from "~/features/orders/bank-transfer.server";
import { shippingAddressSchema } from "~/features/orders/lib/shipping-address";
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

// ★배송지·입금자명의 **관문은 여기**다. 시트의 검사는 친절함이고 이 parse 가 권위다
//   (Layer 2 §5 단일 진입점) — 액션을 직접 두드려도 같은 규칙에 걸린다.
const PAYMENT_METHODS = ["toss", "bank_transfer"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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

  // ── 배송지 ────────────────────────────────────────────────────────────────
  // ★실물 도서가 있으면 **반드시** 받는다. 없으면 받지 않는다 — 강의만 산 사람에게
  //   주소를 묻지 않기 위해서다. 판정은 서버(resolveCartItems)가 하므로 클라가
  //   needsShipping 을 속여도 소용없다.
  let shippingAddress = null as z.infer<typeof shippingAddressSchema> | null;
  if (resolved.needsShipping) {
    let rawAddr: unknown;
    try {
      rawAddr = JSON.parse(String(fd.get("shipping") ?? "null"));
    } catch {
      rawAddr = null;
    }
    const addr = shippingAddressSchema.safeParse(rawAddr);
    if (!addr.success) {
      return data(
        { error: addr.error.issues[0]?.message ?? "배송지를 확인해 주세요." },
        { status: 400 },
      );
    }
    shippingAddress = addr.data;
  }

  // ── 0원 주문 차단 ─────────────────────────────────────────────────────────
  // ★주문을 만든 **뒤에** 보면 안 된다. 토스 쪽 찌꺼기는 30분 뒤 스윕되지만,
  //   무통장 찌꺼기는 pending_deposit 으로 72시간 살아 있으면서 위의 중복 가드에 걸려
  //   그 사람의 다음 무통장 주문을 막는다. 그래서 두 갈래가 갈라지기 전에 한 번만 본다.
  const payableKrw = Math.max(
    0,
    resolved.subtotalKrw + resolved.shippingFeeKrw - couponDiscountKrw,
  );
  if (payableKrw <= 0)
    return data({ error: "결제 금액이 0원입니다" }, { status: 400 });

  // ── 결제수단 ──────────────────────────────────────────────────────────────
  const rawMethod = String(fd.get("method") ?? "toss");
  if (!(PAYMENT_METHODS as readonly string[]).includes(rawMethod)) {
    return data({ error: "결제수단을 확인해 주세요." }, { status: 400 });
  }
  const method = rawMethod as PaymentMethod;

  if (method === "bank_transfer") {
    const depositorName = String(fd.get("depositorName") ?? "").trim();
    if (!depositorName || depositorName.length > 40) {
      return data({ error: "입금자명을 입력해 주세요." }, { status: 400 });
    }
    // 중복 신청 가드 — 입금 대기 주문을 쌓아 두면 어느 건으로 입금됐는지 운영이 못 가른다.
    const { count: pending } = await client
      .from("orders")
      .select("order_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending_deposit");
    if ((pending ?? 0) > 0) {
      return data(
        {
          error:
            "이미 입금 대기 중인 주문이 있습니다. 입금 확인 뒤에 다시 신청해 주세요.",
        },
        { status: 409 },
      );
    }
    const bank = await createBankTransferCartOrder({
      userId: user.id,
      items: resolved.items,
      shippingFeeKrw: resolved.shippingFeeKrw,
      couponId,
      couponDiscountKrw,
      shippingAddress,
      depositorName,
    });
    return data({
      ok: true,
      method: "bank_transfer" as const,
      // ★토스 경로와 달리 **우리 주문 id** 를 그대로 돌려준다(입금 안내 화면 주소가 된다).
      orderId: bank.orderId,
      amount: bank.amountKrw,
      expiresAt: bank.expiresAt,
    });
  }

  const order = await createCartOrder({
    userId: user.id,
    items: resolved.items,
    shippingFeeKrw: resolved.shippingFeeKrw,
    couponId,
    couponDiscountKrw,
    shippingAddress,
  });
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
    method: "toss" as const,
    orderId: tossOrderId,
    amount: order.totalKrw,
    orderName,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

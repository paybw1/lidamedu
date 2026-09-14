// POST /api/lecture/cart/quote — 장바구니 견적 (feat-11-012 P5-b).
//
// ★종전에는 이 자리에 「쿠폰 미리보기」만 있었고(preview-cart-coupon), 금액은 화면이
//   따로 더했다. 그래서 화면이 **배송비를 몰랐고**, 버튼에 적힌 금액과 실제 청구액이
//   달랐다. 무료배송 임계도 서버만 알아 "얼마 더 담으면 무료"인지 알 수 없었다.
//   이제 계산은 서버가 하고 화면은 그린다 — 같은 함수(resolveCartItems)를 결제와 공유하므로
//   "화면엔 되는데 결제는 거절"이 구조적으로 생기지 않는다.
//
// ★쿠폰 코드는 **선택**이다. 코드가 틀려도 견적 자체는 ok 로 주고 couponError 를 따로 싣는다 —
//   그래야 쿠폰 오류가 장바구니 표시를 막지 않는다.
// ★비로그인도 견적을 받는다(쿠폰만 로그인 필요). 금액을 못 보면 장바구니가 무용지물이다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCartCoupon } from "~/features/coupons/redeem.server";
import {
  type RawCartItem,
  resolveCartItems,
} from "~/features/orders/cart-resolve.server";

import type { Route } from "./+types/cart-quote";

const itemSchema = z.union([
  z.object({ kind: z.literal("plan"), code: z.string().min(1).max(40) }),
  z.object({
    kind: z.literal("book"),
    bookId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  }),
  z.object({ kind: z.literal("bundle"), bundleId: z.string().uuid() }),
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false as const, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  const fd = await request.formData();
  const code = String(fd.get("code") ?? "").trim();

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return data({ ok: false as const, error: "장바구니 형식이 올바르지 않습니다" });
  }
  const parsed = z.array(itemSchema).min(1).max(50).safeParse(rawItems);
  if (!parsed.success) {
    return data({ ok: false as const, error: "장바구니가 비어 있습니다" });
  }

  const resolved = await resolveCartItems(
    client,
    user?.id ?? null,
    parsed.data as RawCartItem[],
  );
  if (!resolved.ok) {
    // 품절·판매종료 등 — 결제와 **같은 문구**를 그대로 돌려준다.
    return data({ ok: false as const, error: resolved.error });
  }

  // 쿠폰 — 선택. 실패해도 견적은 살린다.
  let couponName: string | null = null;
  let couponDiscountKrw = 0;
  let couponError: string | null = null;
  if (code) {
    if (!user) {
      couponError = "쿠폰은 로그인 후 사용할 수 있습니다.";
    } else {
      const c = await resolveCartCoupon({
        userId: user.id,
        code,
        lines: resolved.couponLines,
      });
      if (c.ok) {
        couponName = c.name;
        couponDiscountKrw = c.discountKrw;
      } else {
        couponError = c.error;
      }
    }
  }

  const payableKrw = Math.max(
    0,
    resolved.subtotalKrw + resolved.shippingFeeKrw - couponDiscountKrw,
  );

  return data({
    ok: true as const,
    lines: resolved.quoteLines,
    subtotalKrw: resolved.subtotalKrw,
    shippingFeeKrw: resolved.shippingFeeKrw,
    freeShippingThresholdKrw: resolved.freeShippingThresholdKrw,
    freeShippingRemainKrw: resolved.freeShippingRemainKrw,
    couponName,
    couponDiscountKrw,
    couponError,
    payableKrw,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

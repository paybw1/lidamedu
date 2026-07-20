// feat-13 — 장바구니 쿠폰 미리보기. 서버 권위 가격으로 할인액 계산(결제 전 확인용).
// 실제 청구는 create-cart-order 가 동일 로직으로 재검증(권위).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCartCoupon } from "~/features/coupons/redeem.server";
import {
  type RawCartItem,
  resolveCartItems,
} from "~/features/orders/cart-resolve.server";

import type { Route } from "./+types/preview-cart-coupon";

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
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "로그인이 필요합니다" }, { status: 401 });

  const fd = await request.formData();
  const code = String(fd.get("code") ?? "").trim();
  if (!code) return data({ ok: false, error: "쿠폰 코드를 입력해 주세요." });
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return data({ ok: false, error: "장바구니 형식이 올바르지 않습니다" });
  }
  const parsed = z.array(itemSchema).min(1).max(50).safeParse(rawItems);
  if (!parsed.success)
    return data({ ok: false, error: "장바구니가 비어 있습니다" });

  const resolved = await resolveCartItems(
    client,
    user.id,
    parsed.data as RawCartItem[],
  );
  if (!resolved.ok) return data({ ok: false, error: resolved.error });

  const c = await resolveCartCoupon({
    userId: user.id,
    code,
    lines: resolved.couponLines,
  });
  if (!c.ok) return data({ ok: false, error: c.error });
  return data({
    ok: true,
    name: c.name,
    discountKrw: c.discountKrw,
    eligibleKrw: c.eligibleKrw,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

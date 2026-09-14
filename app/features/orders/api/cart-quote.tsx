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

import { getBankAccount } from "~/core/lib/app-settings.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCartCoupon } from "~/features/coupons/redeem.server";
import {
  type RawCartItem,
  resolveCartItems,
} from "~/features/orders/cart-resolve.server";
import { toDomesticPhone } from "~/features/orders/lib/shipping-address";
import { maxUsablePoints } from "~/features/points/lib/point-spend";
import { getPointBalance } from "~/features/points/points.server";

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

  // ── 결제 시트가 필요로 하는 것 (feat-11-012 P5-d·P5-e) ────────────────────
  // ★같은 왕복에 실어 보낸다. 따로 부르면 「견적은 왔는데 배송지 기본값이 아직」 같은
  //   반쪽 상태가 생기고, 시트가 두 응답을 기다리느라 늦게 뜬다.
  //   이 API 는 이미 「화면이 결제 전에 알아야 하는 것」의 단일 출처다.
  let shippingDefaults: {
    name: string;
    phone: string;
    address1: string;
  } | null = null;
  if (user && resolved.needsShipping) {
    // ★타 사용자가 아니라 **본인** 행이므로 요청 클라이언트(RLS)로 읽는다.
    const { data: me } = await client
      .from("profiles")
      .select("name, phone_e164, address")
      .eq("profile_id", user.id)
      .maybeSingle();
    shippingDefaults = {
      name: me?.name ?? "",
      // ★E.164(+82…) 그대로 내려보내면 시트가 제 검사에 걸린다 — 국내 표기로 돌린다.
      phone: toDomesticPhone(me?.phone_e164),
      address1: me?.address ?? "",
    };
  }

  // 무통장 계좌 — 미설정이면 null 이고, 그때 시트는 무통장을 **내밀지 않는다.**
  const bankAccount = await getBankAccount(client);

  // ── 포인트 (feat-11-013 D15) ──────────────────────────────────────────────
  // ★잔액을 **화면에서 더하지 않는다.** 예전에 최근 200건만 더해 잔액이 틀렸고, 그 틀린
  //   값으로 「포인트 부족」 판정까지 했다(points.server.ts 주석). 권위는 getPointBalance.
  // ★상한도 여기서 낸다 — 견적과 결제가 **같은 순수 함수**를 써야 「화면엔 되는데 결제는
  //   거절」이 안 난다(이 파일 머리의 resolveCartItems 공유와 같은 이유).
  // ★비로그인은 null — 0 으로 내리면 「포인트 부족」이 떠서, 로그인만 하면 쓸 수 있는
  //   학생에게 거짓말을 한다(현장강의 바는 비로그인도 시트를 연다).
  const pointBalance = user ? await getPointBalance(user.id) : null;
  const pointMaxUsableKrw =
    pointBalance == null ? 0 : maxUsablePoints({ balance: pointBalance, payableKrw });

  return data({
    ok: true as const,
    lines: resolved.quoteLines,
    needsShipping: resolved.needsShipping,
    shippingDefaults,
    bankAccount,
    subtotalKrw: resolved.subtotalKrw,
    shippingFeeKrw: resolved.shippingFeeKrw,
    freeShippingThresholdKrw: resolved.freeShippingThresholdKrw,
    freeShippingRemainKrw: resolved.freeShippingRemainKrw,
    couponName,
    couponDiscountKrw,
    couponError,
    payableKrw,
    /** 보유 포인트. null = 비로그인(시트는 포인트 칸을 아예 그리지 않는다). */
    pointBalance,
    /** 이 주문에 쓸 수 있는 최대 포인트(원). 화면과 결제가 같은 함수로 낸 값이다. */
    pointMaxUsableKrw,
  });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

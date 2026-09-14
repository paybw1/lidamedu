// feat-11/feat-13 — 장바구니 항목 서버 재해석(가격·판매상태 검증). 서버 권위 금액.
// 결제 개시(create-cart-order)와 쿠폰 미리보기(preview-cart-coupon)가 공용.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getFreeShippingThresholdKrw } from "~/core/lib/app-settings.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import type { CartLineForCoupon } from "~/features/coupons/labels";
import { getPlanByCode } from "~/features/subscriptions/queries.server";

import type { CartOrderItem } from "./orders.server";

// 클라 장바구니 항목(가격 없음 — 서버가 재해석).
export type RawCartItem =
  | { kind: "plan"; code: string }
  | { kind: "book"; bookId: string; quantity: number }
  | { kind: "bundle"; bundleId: string };

/**
 * 화면이 **그대로 그릴** 견적 줄 — 원 항목 단위(세트는 분해하지 않는다).
 * ★items 는 지급용이라 세트가 구성 도서로 쪼개져 있어 화면의 삭제·수량 버튼과 키가 맞지 않는다.
 */
export interface CartQuoteLine {
  /** 화면 장바구니 항목 키(cartItemKey 와 같은 규칙). */
  key: string;
  kind: "plan" | "book" | "bundle";
  name: string;
  unitPriceKrw: number;
  quantity: number;
  lineTotalKrw: number;
}

export type ResolvedCart =
  | {
      ok: true;
      items: CartOrderItem[]; // order_items 지급용(번들=회원도서 분해)
      couponLines: CartLineForCoupon[]; // 쿠폰 범위 매칭용(원 항목 단위)
      names: string[];
      shippingFeeKrw: number;
      // ── 아래는 화면 표시용 (feat-11-012 P5-b) ──────────────────────────
      // ★종전에는 화면이 자기 방식으로 금액을 더했고 **배송비를 몰랐다** — 버튼에 적힌
      //   금액과 실제 청구액이 달랐다. 계산은 서버가 하고 화면은 그리기만 한다.
      quoteLines: CartQuoteLine[];
      subtotalKrw: number;
      /** 무료배송 임계(0 = 미적용). */
      freeShippingThresholdKrw: number;
      /** 무료배송까지 남은 금액(0 = 이미 무료이거나 임계 미적용). */
      freeShippingRemainKrw: number;
    }
  | { ok: false; error: string; status: number };

// 현재 재고(v_book_stock) — 하부 book_stock_moves 가 staff-only RLS 라 adminClient 로 읽는다.
//   행 없으면(입고 이력 없음) 0으로 간주(track_stock=on 인데 입고 없음 = 품절).
async function bookStock(bookId: string): Promise<number> {
  const { data } = await adminClient
    .from("v_book_stock")
    .select("stock")
    .eq("book_id", bookId)
    .maybeSingle();
  return Number(data?.stock ?? 0);
}

export async function resolveCartItems(
  client: SupabaseClient<Database>,
  /**
   * 구매자. 견적(비로그인 열람)에서는 null 이 올 수 있다 —
   * ★1인당 구매한도는 "누가 샀는지"를 알아야 세므로 그때만 건너뛴다.
   *   결제 개시(create-cart-order)는 로그인 강제라 항상 값이 있다(권위 불변).
   */
  userId: string | null,
  rawItems: RawCartItem[],
): Promise<ResolvedCart> {
  const items: CartOrderItem[] = [];
  const couponLines: CartLineForCoupon[] = [];
  const names: string[] = [];
  const quoteLines: CartQuoteLine[] = [];
  let shippingFeeKrw = 0;
  let bookGoodsKrw = 0; // 도서(단품·세트) 결제금액 합 — 무료배송 임계 판정 기준.

  for (const it of rawItems) {
    if (it.kind === "plan") {
      const plan = await getPlanByCode(client, it.code);
      if (!plan) return { ok: false, error: "상품을 찾을 수 없습니다", status: 404 };
      if (plan.productKind !== "course" && plan.productKind !== "tpass")
        return {
          ok: false,
          error: "강의 상품만 장바구니로 결제할 수 있습니다",
          status: 400,
        };
      if (plan.priceKrw <= 0)
        return { ok: false, error: "유료 상품만 결제할 수 있습니다", status: 400 };
      items.push({ itemType: "plan", planId: plan.planId, unitPriceKrw: plan.priceKrw });
      couponLines.push({ kind: "course", amountKrw: plan.priceKrw });
      names.push(plan.name);
      quoteLines.push({
        key: `plan:${it.code}`,
        kind: "plan",
        name: plan.name,
        unitPriceKrw: plan.priceKrw,
        quantity: 1,
        lineTotalKrw: plan.priceKrw,
      });
    } else if (it.kind === "book") {
      const { data: book } = await client
        .from("books")
        .select(
          "book_id, title, price_krw, sale_status, shipping_fee_type, shipping_fee_krw, per_person_limit, track_stock",
        )
        .eq("book_id", it.bookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!book || book.sale_status !== "on_sale")
        return { ok: false, error: "판매 중인 도서가 아닙니다", status: 404 };
      if (book.price_krw <= 0)
        return { ok: false, error: "유료 도서만 결제할 수 있습니다", status: 400 };
      // ★품절 서버 재검증 — 재고 관리(track_stock) 도서는 현재 재고가 요청 수량 이상이어야
      //   결제 허용. FE soldOut 표시에만 의존하면 동시결제·직접호출로 음수 재고가 날 수 있어
      //   결제 authority(cart-resolve)에서 차단한다.
      if (book.track_stock) {
        const avail = await bookStock(book.book_id);
        if (avail < it.quantity)
          return {
            ok: false,
            error: `《${book.title}》 재고가 부족합니다 (남은 재고 ${Math.max(avail, 0)}개).`,
            status: 400,
          };
      }
      if (book.per_person_limit != null && userId) {
        const { data: prior } = await adminClient
          .from("order_items")
          .select("quantity, orders!inner(user_id, status)")
          .eq("book_id", book.book_id)
          .eq("orders.user_id", userId)
          .eq("orders.status", "paid");
        const bought = (prior ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
        if (bought + it.quantity > book.per_person_limit)
          return {
            ok: false,
            error: `《${book.title}》 은 1인당 ${book.per_person_limit}개까지 구매할 수 있습니다.`,
            status: 400,
          };
      }
      if (book.shipping_fee_type === "prepaid")
        shippingFeeKrw += book.shipping_fee_krw ?? 0;
      bookGoodsKrw += book.price_krw * it.quantity;
      items.push({
        itemType: "book",
        bookId: book.book_id,
        unitPriceKrw: book.price_krw,
        quantity: it.quantity,
      });
      couponLines.push({ kind: "book", amountKrw: book.price_krw * it.quantity });
      names.push(`${book.title}${it.quantity > 1 ? ` x${it.quantity}` : ""}`);
      quoteLines.push({
        key: `book:${book.book_id}`,
        kind: "book",
        name: book.title,
        unitPriceKrw: book.price_krw,
        quantity: it.quantity,
        lineTotalKrw: book.price_krw * it.quantity,
      });
    } else {
      const { data: bundle } = await client
        .from("book_bundles")
        .select("bundle_id, title, price_krw, sale_status")
        .eq("bundle_id", it.bundleId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!bundle || bundle.sale_status !== "on_sale")
        return { ok: false, error: "판매 중인 세트가 아닙니다", status: 404 };
      if (bundle.price_krw <= 0)
        return { ok: false, error: "유료 세트만 결제할 수 있습니다", status: 400 };
      const { data: members } = await client
        .from("book_bundle_items")
        .select(
          "book_id, books(title, price_krw, sale_status, deleted_at, track_stock)",
        )
        .eq("bundle_id", it.bundleId);
      const valid = (members ?? []).filter((m) => {
        const b = m.books as {
          price_krw: number;
          sale_status: string;
          deleted_at: string | null;
        } | null;
        return b && b.sale_status === "on_sale" && b.deleted_at === null;
      });
      if (valid.length === 0)
        return { ok: false, error: "세트 구성 도서가 없습니다", status: 400 };
      // ★세트 구성 도서도 품절 서버 재검증(track_stock 도서는 1개 이상 필요).
      for (const m of valid) {
        const b = m.books as { title: string; track_stock: boolean };
        if (b.track_stock && (await bookStock(m.book_id)) < 1)
          return {
            ok: false,
            error: `세트 구성 도서 《${b.title}》 재고가 부족합니다.`,
            status: 400,
          };
      }
      const listPrices = valid.map(
        (m) => (m.books as { price_krw: number }).price_krw,
      );
      const sumList = listPrices.reduce((s, p) => s + p, 0);
      let allocated = 0;
      valid.forEach((m, i) => {
        const isLast = i === valid.length - 1;
        const unit = isLast
          ? bundle.price_krw - allocated
          : sumList > 0
            ? Math.round((bundle.price_krw * listPrices[i]) / sumList)
            : Math.round(bundle.price_krw / valid.length);
        allocated += unit;
        items.push({
          itemType: "book",
          bookId: m.book_id,
          unitPriceKrw: unit,
          quantity: 1,
        });
      });
      couponLines.push({ kind: "bundle", amountKrw: bundle.price_krw });
      bookGoodsKrw += bundle.price_krw;
      names.push(`[세트] ${bundle.title}`);
      quoteLines.push({
        key: `bundle:${bundle.bundle_id}`,
        kind: "bundle",
        name: `[세트] ${bundle.title}`,
        unitPriceKrw: bundle.price_krw,
        quantity: 1,
        lineTotalKrw: bundle.price_krw,
      });
    }
  }

  // 도서 무료배송 임계 — 도서 결제금액 합이 임계 이상이면 배송비 면제.
  // ★임계·남은 금액도 화면에 내려보낸다. 종전에는 서버만 알고 있어 "얼마 더 담으면 무료"인지
  //   알 수 없었고, 도서 상세는 "배송비는 결제 단계에서 안내됩니다"라고 약속하는데 그 안내가
  //   나오는 화면이 없었다(feat-11-012 P5-b).
  let freeShippingThresholdKrw = 0;
  if (shippingFeeKrw > 0) {
    freeShippingThresholdKrw = await getFreeShippingThresholdKrw(client);
    if (freeShippingThresholdKrw > 0 && bookGoodsKrw >= freeShippingThresholdKrw) {
      shippingFeeKrw = 0;
    }
  }
  const freeShippingRemainKrw =
    shippingFeeKrw > 0 && freeShippingThresholdKrw > 0
      ? Math.max(0, freeShippingThresholdKrw - bookGoodsKrw)
      : 0;
  const subtotalKrw = quoteLines.reduce((s, l) => s + l.lineTotalKrw, 0);

  return {
    ok: true,
    items,
    couponLines,
    names,
    shippingFeeKrw,
    quoteLines,
    subtotalKrw,
    freeShippingThresholdKrw,
    freeShippingRemainKrw,
  };
}

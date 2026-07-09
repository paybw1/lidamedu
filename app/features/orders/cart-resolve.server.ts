// feat-11/feat-13 — 장바구니 항목 서버 재해석(가격·판매상태 검증). 서버 권위 금액.
// 결제 개시(create-cart-order)와 쿠폰 미리보기(preview-cart-coupon)가 공용.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import type { CartLineForCoupon } from "~/features/coupons/labels";
import { getPlanByCode } from "~/features/subscriptions/queries.server";

import type { CartOrderItem } from "./orders.server";

// 클라 장바구니 항목(가격 없음 — 서버가 재해석).
export type RawCartItem =
  | { kind: "plan"; code: string }
  | { kind: "book"; bookId: string; quantity: number }
  | { kind: "bundle"; bundleId: string };

export type ResolvedCart =
  | {
      ok: true;
      items: CartOrderItem[]; // order_items 지급용(번들=회원도서 분해)
      couponLines: CartLineForCoupon[]; // 쿠폰 범위 매칭용(원 항목 단위)
      names: string[];
      shippingFeeKrw: number;
    }
  | { ok: false; error: string; status: number };

export async function resolveCartItems(
  client: SupabaseClient<Database>,
  userId: string,
  rawItems: RawCartItem[],
): Promise<ResolvedCart> {
  const items: CartOrderItem[] = [];
  const couponLines: CartLineForCoupon[] = [];
  const names: string[] = [];
  let shippingFeeKrw = 0;

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
    } else if (it.kind === "book") {
      const { data: book } = await client
        .from("books")
        .select(
          "book_id, title, price_krw, sale_status, shipping_fee_type, shipping_fee_krw, per_person_limit",
        )
        .eq("book_id", it.bookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!book || book.sale_status !== "on_sale")
        return { ok: false, error: "판매 중인 도서가 아닙니다", status: 404 };
      if (book.price_krw <= 0)
        return { ok: false, error: "유료 도서만 결제할 수 있습니다", status: 400 };
      if (book.per_person_limit != null) {
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
      items.push({
        itemType: "book",
        bookId: book.book_id,
        unitPriceKrw: book.price_krw,
        quantity: it.quantity,
      });
      couponLines.push({ kind: "book", amountKrw: book.price_krw * it.quantity });
      names.push(`${book.title}${it.quantity > 1 ? ` x${it.quantity}` : ""}`);
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
        .select("book_id, books(price_krw, sale_status, deleted_at)")
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
      names.push(`[세트] ${bundle.title}`);
    }
  }

  return { ok: true, items, couponLines, names, shippingFeeKrw };
}

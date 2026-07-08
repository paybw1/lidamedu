// feat-11 장바구니(C1) — 다건 체크아웃. 강의(plan: course/tpass)·도서(book) 혼합 주문 생성 +
// 주문 단위 pending 결제 → 토스 orderId 반환. 클라가 받은 orderId 로 토스 SDK 결제.
// ★서버 권위 금액(클라 가격 불신). plan 은 course/tpass 만 허용(그 외는 주문 fulfill 로 지급이
//   안 돼 결제만 되고 접근 미지급되는 사고 방지 — 학습 구독 상품은 카트 대상 아님).
import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  type CartOrderItem,
  createCartOrder,
} from "~/features/orders/orders.server";
import {
  createPendingCartPayment,
  getPlanByCode,
} from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/create-cart-order";

const itemSchema = z.union([
  z.object({ kind: z.literal("plan"), code: z.string().min(1).max(40) }),
  z.object({
    kind: z.literal("book"),
    bookId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  }),
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

  // 서버에서 각 항목 재해석(가격·판매상태 검증). plan=course/tpass 만, book=on_sale 만.
  const resolved: CartOrderItem[] = [];
  const names: string[] = [];
  for (const it of parsed.data.items) {
    if (it.kind === "plan") {
      const plan = await getPlanByCode(client, it.code);
      if (!plan) return data({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
      if (plan.productKind !== "course" && plan.productKind !== "tpass") {
        return data(
          { error: "강의 상품만 장바구니로 결제할 수 있습니다" },
          { status: 400 },
        );
      }
      if (plan.priceKrw <= 0)
        return data({ error: "유료 상품만 결제할 수 있습니다" }, { status: 400 });
      resolved.push({
        itemType: "plan",
        planId: plan.planId,
        unitPriceKrw: plan.priceKrw,
      });
      names.push(plan.name);
    } else {
      const { data: book } = await client
        .from("books")
        .select("book_id, title, price_krw, sale_status")
        .eq("book_id", it.bookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!book || book.sale_status !== "on_sale")
        return data({ error: "판매 중인 도서가 아닙니다" }, { status: 404 });
      if (book.price_krw <= 0)
        return data({ error: "유료 도서만 결제할 수 있습니다" }, { status: 400 });
      resolved.push({
        itemType: "book",
        bookId: book.book_id,
        unitPriceKrw: book.price_krw,
        quantity: it.quantity,
      });
      names.push(`${book.title}${it.quantity > 1 ? ` x${it.quantity}` : ""}`);
    }
  }

  const order = await createCartOrder({ userId: user.id, items: resolved });
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
    names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}건`;
  return data({
    ok: true,
    orderId: tossOrderId,
    amount: order.totalKrw,
    orderName,
  });
}

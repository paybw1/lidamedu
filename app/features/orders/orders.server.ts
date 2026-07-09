// feat-11-004 4a — 주문 생성·전이·지급(fulfill)·회수(revoke)·부분 환불. 설계 §3.8.
// ★이중 경로 금지: plan 단건 결제도 이 모듈의 1-item 주문을 경유(payments.order_id).
// 전부 서버 전용(adminClient — orders/order_items RLS 에 쓰기 정책 없음).

import adminClient from "~/core/lib/supa-admin-client.server";
import { getCourseTotalDuration } from "~/features/lms/queries.server";

// ── 생성 ────────────────────────────────────────────────────────────────────

/** 기존 플랜 단건 체크아웃용 1-item 주문 — create-order.tsx 가 결제 시작 시 호출. */
export async function createSinglePlanOrder(input: {
  userId: string;
  planId: string;
  subjectCode?: string | null;
  amountKrw: number;
  discountId?: string | null;
  paymentMethod?: "toss" | "bank_transfer" | "free" | "manual";
}): Promise<{ orderId: string; orderItemId: string }> {
  const { data: order, error } = await adminClient
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending_payment",
      total_krw: input.amountKrw,
      discount_id: input.discountId ?? null,
      payment_method: input.paymentMethod ?? "toss",
    })
    .select("order_id")
    .single();
  if (error) throw error;
  const { data: item, error: itemErr } = await adminClient
    .from("order_items")
    .insert({
      order_id: order.order_id,
      item_type: "plan",
      plan_id: input.planId,
      subject_code: input.subjectCode ?? null,
      unit_price_krw: input.amountKrw,
    })
    .select("order_item_id")
    .single();
  if (itemErr) throw itemErr;
  return { orderId: order.order_id, orderItemId: item.order_item_id };
}

/** 장바구니 다건 체크아웃 주문 — 강의(plan)·도서(book) 혼합. create-cart-order 액션이 호출.
 *  가격은 서버가 이미 검증한 값(unitPriceKrw)만 받는다. 지급은 confirmPayment→
 *  markOrderPaidAndFulfill 이 order_items 순회로 처리(강의=enrollment·도서=배송). */
export type CartOrderItem =
  | {
      itemType: "plan";
      planId: string;
      subjectCode?: string | null;
      unitPriceKrw: number;
    }
  | { itemType: "book"; bookId: string; unitPriceKrw: number; quantity: number };

export async function createCartOrder(input: {
  userId: string;
  items: CartOrderItem[];
  shippingFeeKrw?: number; // 선불 배송료 합계(주문 총액 가산)
  paymentMethod?: "toss" | "bank_transfer" | "free" | "manual";
}): Promise<{ orderId: string; totalKrw: number }> {
  const qtyOf = (it: CartOrderItem) => (it.itemType === "book" ? it.quantity : 1);
  const shipping = input.shippingFeeKrw ?? 0;
  const totalKrw =
    input.items.reduce((s, it) => s + it.unitPriceKrw * qtyOf(it), 0) + shipping;
  const { data: order, error } = await adminClient
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending_payment",
      total_krw: totalKrw,
      shipping_fee_krw: shipping,
      payment_method: input.paymentMethod ?? "toss",
    })
    .select("order_id")
    .single();
  if (error) throw error;
  const rows = input.items.map((it) =>
    it.itemType === "plan"
      ? {
          order_id: order.order_id,
          item_type: "plan" as const,
          plan_id: it.planId,
          subject_code: it.subjectCode ?? null,
          unit_price_krw: it.unitPriceKrw,
          quantity: 1,
        }
      : {
          order_id: order.order_id,
          item_type: "book" as const,
          book_id: it.bookId,
          unit_price_krw: it.unitPriceKrw,
          quantity: it.quantity,
        },
  );
  const { error: itemErr } = await adminClient.from("order_items").insert(rows);
  if (itemErr) throw itemErr;
  return { orderId: order.order_id, totalKrw };
}

// ── 지급 (fulfill) ──────────────────────────────────────────────────────────
// plan(subject/bundle/membership) 항목의 user_subscriptions 지급은 기존
// confirmPayment→upsertPaidSubscription 경로가 그대로 담당(중복 지급 방지).
// 이 모듈은 주문 상태 전이 + course/tpass 항목의 enrollments 지급(+4c 도서 배송)만 맡는다.

/** 결제 완료 전이 + 지급. 멱등 — 이미 paid 면 지급 스킵, enrollment 는 order_item 기준 중복 방지. */
export async function markOrderPaidAndFulfill(orderId: string): Promise<void> {
  const { data: order } = await adminClient
    .from("orders")
    .select("order_id, user_id, status, discount_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return;
  const firstTransition = order.status !== "paid";
  if (order.status !== "paid") {
    const { error } = await adminClient
      .from("orders")
      .update({ status: "paid" })
      .eq("order_id", orderId)
      .in("status", ["pending_payment", "pending_deposit"]);
    if (error) {
      console.error("[orders] paid transition failed:", error.message);
      return;
    }
  }
  const { data: items } = await adminClient
    .from("order_items")
    .select("order_item_id, item_type, plan_id, book_id, quantity")
    .eq("order_id", orderId)
    .is("refunded_at", null);
  for (const item of items ?? []) {
    if (item.item_type === "plan" && item.plan_id) {
      await fulfillCourseEnrollments({
        orderItemId: item.order_item_id,
        userId: order.user_id,
        planId: item.plan_id,
      });
    }
    if (item.item_type === "book" && item.book_id) {
      await fulfillBookShipment({
        orderItemId: item.order_item_id,
        bookId: item.book_id,
        quantity: item.quantity,
      });
    }
  }
  // 4d — 쿠폰 훅(사용 마킹 + 첫 구매 자동 발급). 최초 전이에서만.
  if (firstTransition) {
    const { onOrderPaidCouponHooks } = await import(
      "~/features/orders/coupons.server"
    );
    await onOrderPaidCouponHooks({
      orderId: order.order_id,
      userId: order.user_id,
      discountId: order.discount_id,
    });
  }
}

/** 도서 항목 지급(4c) — shipment 생성(주문당 1건 unique=멱등) + 재고 sale 차감.
 *  ★PDF 도서는 배송·재고 없음(다운로드로 제공) → 지급 스킵. */
async function fulfillBookShipment(input: {
  orderItemId: string;
  bookId: string;
  quantity: number;
}): Promise<void> {
  const { data: bk } = await adminClient
    .from("books")
    .select("book_type")
    .eq("book_id", input.bookId)
    .maybeSingle();
  if (bk?.book_type === "pdf") return; // PDF = 다운로드 제공, 배송/재고 없음
  const { error } = await adminClient.from("shipments").insert({
    order_item_id: input.orderItemId,
    status: "preparing",
  });
  if (error) {
    if (error.code === "23505") return; // 이미 지급(멱등)
    console.error("[orders] shipment create failed:", error.message);
    return;
  }
  const { error: stockErr } = await adminClient.from("book_stock_moves").insert({
    book_id: input.bookId,
    delta: -input.quantity,
    reason: "sale",
    order_item_id: input.orderItemId,
  });
  if (stockErr) console.error("[orders] stock sale move failed:", stockErr.message);
}

/** course/tpass 상품 → plan_courses 의 각 강의에 enrollment 지급 (멱등: order_item 기준). */
async function fulfillCourseEnrollments(input: {
  orderItemId: string;
  userId: string;
  planId: string;
}): Promise<void> {
  const { data: plan } = await adminClient
    .from("subscription_plans")
    .select("product_kind")
    .eq("plan_id", input.planId)
    .maybeSingle();
  if (!plan || !["course", "tpass"].includes(plan.product_kind)) return;

  // 멱등 — 이 order_item 으로 이미 지급했으면 스킵(웹훅·confirm 이중 호출 대비)
  const { count } = await adminClient
    .from("enrollments")
    .select("enrollment_id", { count: "exact", head: true })
    .eq("order_item_id", input.orderItemId);
  if ((count ?? 0) > 0) return;

  const [{ data: policy }, { data: links }] = await Promise.all([
    adminClient
      .from("plan_policies")
      .select("duration_days, fixed_end_date, multiplier")
      .eq("plan_id", input.planId)
      .maybeSingle(),
    adminClient.from("plan_courses").select("course_id").eq("plan_id", input.planId),
  ]);
  const expiresAt = policy?.fixed_end_date
    ? new Date(`${policy.fixed_end_date}T23:59:59+09:00`).toISOString()
    : new Date(Date.now() + (policy?.duration_days ?? 180) * 86400_000).toISOString();

  for (const link of links ?? []) {
    const baseDuration = await getCourseTotalDuration(link.course_id);
    const { error } = await adminClient.from("enrollments").insert({
      user_id: input.userId,
      course_id: link.course_id,
      plan_id: input.planId,
      source: "order",
      order_item_id: input.orderItemId,
      expires_at: expiresAt,
      multiplier_snapshot: policy?.multiplier ?? null,
      base_duration_snapshot_seconds: baseDuration,
    });
    if (error) console.error("[orders] enrollment grant failed:", error.message);
  }
}

// ── 회수 (revoke) ───────────────────────────────────────────────────────────

/** 주문 전체 환불 전이 + 지급물 회수. user_subscriptions 회수는 기존 웹훅/셀프해지 경로가 담당. */
export async function markOrderRefundedAndRevoke(
  orderId: string,
  reason: string,
): Promise<void> {
  await adminClient
    .from("orders")
    .update({ status: "refunded" })
    .eq("order_id", orderId)
    .in("status", ["paid", "partially_refunded", "pending_deposit", "pending_payment"]);
  const { data: items } = await adminClient
    .from("order_items")
    .select("order_item_id")
    .eq("order_id", orderId);
  for (const item of items ?? []) {
    await revokeItemFulfillment(item.order_item_id, reason);
  }
}

async function revokeItemFulfillment(orderItemId: string, reason: string): Promise<void> {
  const { error } = await adminClient
    .from("enrollments")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
    })
    .eq("order_item_id", orderItemId)
    .in("status", ["active", "paused"]);
  if (error) console.error("[orders] revoke failed:", error.message);

  // 도서 항목(4c) — 배송 returned 처리 + 재고 refund 복원(판매 차감이 있었던 경우만, 멱등).
  const { data: item } = await adminClient
    .from("order_items")
    .select("book_id, quantity, item_type")
    .eq("order_item_id", orderItemId)
    .maybeSingle();
  if (item?.item_type === "book" && item.book_id) {
    await adminClient
      .from("shipments")
      .update({ status: "returned" })
      .eq("order_item_id", orderItemId)
      .neq("status", "returned");
    const { data: saleMove } = await adminClient
      .from("book_stock_moves")
      .select("move_id")
      .eq("order_item_id", orderItemId)
      .eq("reason", "sale")
      .limit(1)
      .maybeSingle();
    const { data: refundMove } = await adminClient
      .from("book_stock_moves")
      .select("move_id")
      .eq("order_item_id", orderItemId)
      .eq("reason", "refund")
      .limit(1)
      .maybeSingle();
    if (saleMove && !refundMove) {
      await adminClient.from("book_stock_moves").insert({
        book_id: item.book_id,
        delta: item.quantity,
        reason: "refund",
        order_item_id: orderItemId,
        note: reason,
      });
    }
  }
}

// ── 부분 환불 (항목 단위, ★★★★) ────────────────────────────────────────────

/** 관리자 항목 부분 환불 — 토스 부분취소 → item 환불 기록 → 해당 항목 지급물 회수. */
export async function refundOrderItem(input: {
  orderItemId: string;
  reason: string;
  actorId: string;
}): Promise<{ ok: true; refundedKrw: number } | { ok: false; error: string }> {
  const { data: item } = await adminClient
    .from("order_items")
    .select("order_item_id, order_id, unit_price_krw, quantity, refunded_at")
    .eq("order_item_id", input.orderItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "주문 항목을 찾을 수 없습니다." };
  if (item.refunded_at) return { ok: false, error: "이미 환불된 항목입니다." };
  const { data: order } = await adminClient
    .from("orders")
    .select("order_id, status, payment_method")
    .eq("order_id", item.order_id)
    .maybeSingle();
  if (!order || !["paid", "partially_refunded"].includes(order.status)) {
    return { ok: false, error: "결제 완료 상태의 주문만 환불할 수 있습니다." };
  }
  const refundKrw = item.unit_price_krw * item.quantity;

  // 토스 결제 주문이면 부분취소 API — 무통장/수동은 장부 기록만(정산 외 이체).
  if (order.payment_method === "toss" && refundKrw > 0) {
    const { data: payment } = await adminClient
      .from("payments")
      .select("payment_id, toss_payment_key, status")
      .eq("order_id", order.order_id)
      .eq("status", "completed")
      .maybeSingle();
    if (!payment?.toss_payment_key) {
      return { ok: false, error: "연결된 토스 결제를 찾을 수 없습니다." };
    }
    const secret = process.env.TOSS_SECRET_KEY;
    if (!secret) return { ok: false, error: "TOSS_SECRET_KEY 미설정" };
    const basic = Buffer.from(`${secret}:`).toString("base64");
    try {
      const res = await fetch(
        `https://api.tosspayments.com/v1/payments/${payment.toss_payment_key}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cancelReason: input.reason, cancelAmount: refundKrw }),
        },
      );
      const payload = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg = typeof payload?.message === "string" ? payload.message : `토스 부분취소 실패 (HTTP ${res.status})`;
        return { ok: false, error: msg };
      }
    } catch (e) {
      return { ok: false, error: `토스 API 호출 실패: ${e instanceof Error ? e.message : String(e)}` };
    }
    // payments 부분환불 누적 기록
    const { data: pay } = await adminClient
      .from("payments")
      .select("refund_amount_krw")
      .eq("payment_id", payment.payment_id)
      .maybeSingle();
    await adminClient
      .from("payments")
      .update({
        refunded_at: new Date().toISOString(),
        refund_amount_krw: (pay?.refund_amount_krw ?? 0) + refundKrw,
        refund_reason: input.reason,
      })
      .eq("payment_id", payment.payment_id);
  }

  // 항목 환불 기록 + 지급물 회수
  await adminClient
    .from("order_items")
    .update({
      refunded_at: new Date().toISOString(),
      refund_amount_krw: refundKrw,
      refund_reason: input.reason,
    })
    .eq("order_item_id", input.orderItemId);
  await revokeItemFulfillment(input.orderItemId, `부분 환불: ${input.reason}`);

  // 주문 상태 — 전 항목 환불이면 refunded, 일부면 partially_refunded
  const { data: remaining } = await adminClient
    .from("order_items")
    .select("order_item_id")
    .eq("order_id", item.order_id)
    .is("refunded_at", null);
  await adminClient
    .from("orders")
    .update({
      status: (remaining ?? []).length === 0 ? "refunded" : "partially_refunded",
    })
    .eq("order_id", item.order_id);
  // 4d — CS 이력 미러
  try {
    const { recordCsAction } = await import("~/features/orders/cs.server");
    const { data: o } = await adminClient
      .from("orders")
      .select("user_id")
      .eq("order_id", item.order_id)
      .maybeSingle();
    if (o) {
      await recordCsAction({
        userId: o.user_id,
        actorId: input.actorId,
        kind: "refund_assist",
        refTable: "order_items",
        refId: input.orderItemId,
        note: `항목 환불 ₩${refundKrw.toLocaleString("ko-KR")} — ${input.reason}`,
      });
    }
  } catch (e) {
    console.error("[orders] cs mirror failed:", e);
  }
  return { ok: true, refundedKrw: refundKrw };
}

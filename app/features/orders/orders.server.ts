// feat-11-004 4a — 주문 생성·전이·지급(fulfill)·회수(revoke)·부분 환불. 설계 §3.8.
// ★이중 경로 금지: plan 단건 결제도 이 모듈의 1-item 주문을 경유(payments.order_id).
// 전부 서버 전용(adminClient — orders/order_items RLS 에 쓰기 정책 없음).

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  getCourseTotalDuration,
  logEnrollmentAdminAction,
} from "~/features/lms/queries.server";
import { awardPoints } from "~/features/points/points.server";

// ── 결제시도 만료 ───────────────────────────────────────────────────────────

/** 결제시도가 만료로 넘어가는 시간(분). 토스 결제창 세션보다 넉넉하게 잡는다. */
export const CHECKOUT_TTL_MINUTES = 30;

/**
 * 결제창을 열고 끝내지 않은 주문을 만료 처리한다.
 *
 * 결제창을 닫을 때 `cancelPendingCheckout` 이 취소로 바꾸지만 그건 브라우저가 살아
 * 있을 때뿐이라(탭을 죽이거나 전원이 꺼지면 신호가 안 온다) 정리되지 않은 주문이
 * 남는다. 이 스윕이 마지막 그물이다 — 무통장 만료(expireOverdueBankTransfers)와
 * 같은 짜임이고, 화면 로더에서 게으르게 + 크론에서 주기적으로 함께 부른다.
 *
 * ★결제 레코드가 하나라도 성공(completed)인 주문은 건드리지 않는다. 승인 응답이
 *   늦게 도착하는 사이에 만료시키면 돈은 받고 주문은 만료인 상태가 된다.
 */
export async function expireStaleCheckoutOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - CHECKOUT_TTL_MINUTES * 60_000).toISOString();
  const { data: stale } = await adminClient
    .from("orders")
    .select("order_id")
    .in("status", ["attempted", "pending_payment"])
    .lt("created_at", cutoff)
    .limit(500);
  if (!stale?.length) return 0;

  const ids = stale.map((o) => o.order_id);
  const { data: paidRows } = await adminClient
    .from("payments")
    .select("order_id")
    .in("order_id", ids)
    .eq("status", "completed");
  const paidOrderIds = new Set((paidRows ?? []).map((p) => p.order_id));
  const expirable = ids.filter((id) => !paidOrderIds.has(id));
  if (!expirable.length) return 0;

  const { data: updated } = await adminClient
    .from("orders")
    .update({ status: "expired" })
    .in("order_id", expirable)
    .in("status", ["attempted", "pending_payment"])
    .select("order_id");
  return (updated ?? []).length;
}

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
      // ★PG 를 부르기 전이다 — 결제 대기가 아니라 "결제시도". 목록·매출·소유
      //   판정에서 빠지고, 30분 지나면 expireStaleCheckoutOrders 가 만료시킨다.
      status: "attempted",
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
  couponId?: string | null; // feat-13 쿠폰 적용(결제 완료 시 사용 기록)
  couponDiscountKrw?: number; // 쿠폰 할인액(총액에서 차감)
  paymentMethod?: "toss" | "bank_transfer" | "free" | "manual";
}): Promise<{ orderId: string; totalKrw: number }> {
  const qtyOf = (it: CartOrderItem) => (it.itemType === "book" ? it.quantity : 1);
  const shipping = input.shippingFeeKrw ?? 0;
  const discount = Math.max(0, input.couponDiscountKrw ?? 0);
  const subtotal = input.items.reduce((s, it) => s + it.unitPriceKrw * qtyOf(it), 0);
  const totalKrw = Math.max(0, subtotal + shipping - discount);
  const { data: order, error } = await adminClient
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "attempted", // ★PG 호출 전 — createSinglePlanOrder 주석 참조.
      total_krw: totalKrw,
      shipping_fee_krw: shipping,
      coupon_id: input.couponId ?? null,
      coupon_discount_krw: discount,
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
    .select("order_id, user_id, status, discount_id, coupon_id, coupon_discount_krw")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return;
  const firstTransition = order.status !== "paid";
  if (order.status !== "paid") {
    const { error } = await adminClient
      .from("orders")
      .update({ status: "paid" })
      .eq("order_id", orderId)
      .in("status", ["attempted", "pending_payment", "pending_deposit"]);
    if (error) {
      console.error("[orders] paid transition failed:", error.message);
      return;
    }
  }
  // feat-11-011 — '결제완료' 포인트(결제액 비율). 정책이 꺼져 있으면 no-op.
  // ★첫 전이일 때만 시도한다. 주문당 1회는 UNIQUE 인덱스가 다시 보증한다.
  if (firstTransition) {
    const { data: paidOrder } = await adminClient
      .from("orders")
      .select("total_krw")
      .eq("order_id", orderId)
      .maybeSingle();
    await awardPoints({
      policyKey: "payment_complete",
      userId: order.user_id,
      refType: "order",
      refId: orderId,
      baseAmountKrw: paidOrder?.total_krw ?? 0,
      orderId,
    }).catch(() => undefined);
  }

  const { data: items } = await adminClient
    .from("order_items")
    .select(
      "order_item_id, item_type, plan_id, book_id, quantity, enrollment_id, unit_price_krw",
    )
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
    // feat-11-010 수강기간 연장 — 만료일 변경은 extension.server 한 곳이 담당한다.
    //   멱등은 enrollment_extensions.order_item_id UNIQUE 가 보장한다.
    if (item.item_type === "course_extension" && item.enrollment_id) {
      const [{ applyEnrollmentExtension }, { getCourseExtensionDefaults }] =
        await Promise.all([
          import("~/features/lms/extension.server"),
          import("~/core/lib/app-settings.server"),
        ]);
      await applyEnrollmentExtension({
        orderItemId: item.order_item_id,
        userId: order.user_id,
        enrollmentId: item.enrollment_id,
        planId: item.plan_id,
        amountKrw: item.unit_price_krw,
        defaults: await getCourseExtensionDefaults(adminClient),
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
    // feat-13 — 장바구니 쿠폰(coupons) 사용 이력 기록.
    const { onOrderPaidCouponRedeem } = await import(
      "~/features/coupons/redeem.server"
    );
    await onOrderPaidCouponRedeem({
      orderId: order.order_id,
      userId: order.user_id,
      couponId: order.coupon_id,
      couponDiscountKrw: order.coupon_discount_krw,
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

  // 수강기간 계산 — current(기존 만료일) 있으면 그로부터 연장(중복 지급 대신 만료일 연장).
  const now = Date.now();
  const addMs = (policy?.duration_days ?? 180) * 86400_000;
  const computeExpiry = (currentIso: string | null): string => {
    if (policy?.fixed_end_date) {
      const fixed = new Date(`${policy.fixed_end_date}T23:59:59+09:00`).getTime();
      return new Date(
        currentIso ? Math.max(Date.parse(currentIso), fixed) : fixed,
      ).toISOString();
    }
    const base = currentIso ? Math.max(now, Date.parse(currentIso)) : now;
    return new Date(base + addMs).toISOString();
  };

  for (const link of links ?? []) {
    const baseDuration = await getCourseTotalDuration(link.course_id);
    // ① 이미 이 강의 수강권이 있으면 = 연장(만료일 연장 + 배수 모수 갱신). 없으면 신규 지급.
    const { data: existing } = await adminClient
      .from("enrollments")
      .select("enrollment_id, expires_at")
      .eq("user_id", input.userId)
      .eq("course_id", link.course_id)
      // ★★enrollments 에는 deleted_at 이 없다. 이 필터가 PostgREST 오류를 내서
      //   existing 이 늘 null 이었고, 재구매 때 만료일 연장 대신 **수강권이 하나 더**
      //   생겼다(2026-09-02 발견 — 아직 중복 사례는 없어 데이터 정정은 불필요).
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const nextExpires = computeExpiry(existing.expires_at);
      const { error } = await adminClient
        .from("enrollments")
        .update({
          plan_id: input.planId,
          order_item_id: input.orderItemId,
          expires_at: nextExpires,
          status: "active",
          // 재구매 = 새 시청 허용량 부여(배수 모수·강의시간 갱신).
          multiplier_snapshot: policy?.multiplier ?? null,
          base_duration_snapshot_seconds: baseDuration,
        })
        .eq("enrollment_id", existing.enrollment_id);
      if (error) {
        console.error("[orders] enrollment extend failed:", error.message);
        continue;
      }
      await logEnrollmentAdminAction({
        enrollmentId: existing.enrollment_id,
        actorId: input.userId,
        action: "extend",
        before: { expires_at: existing.expires_at },
        after: { expires_at: nextExpires, via: "order" },
        reason: "주문 결제 — 수강 연장/재지급",
      });
      continue;
    }

    const { error } = await adminClient.from("enrollments").insert({
      user_id: input.userId,
      course_id: link.course_id,
      plan_id: input.planId,
      source: "order",
      order_item_id: input.orderItemId,
      expires_at: computeExpiry(null),
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
  // feat-11-010 — 연장 결제 환불은 **수강권 회수가 아니라 일수 원복**이다.
  //   여기서 먼저 처리하고 아래 revoke 로 내려가지 않게 막는다(연장 항목엔 지급된 수강권이 없다).
  const { data: extItem } = await adminClient
    .from("order_items")
    .select("item_type")
    .eq("order_item_id", orderItemId)
    .maybeSingle();
  if (extItem?.item_type === "course_extension") {
    const { revertEnrollmentExtension } = await import(
      "~/features/lms/extension.server"
    );
    await revertEnrollmentExtension(orderItemId, reason);
    return;
  }

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

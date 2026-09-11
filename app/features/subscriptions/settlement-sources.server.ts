// feat-8-031 — 강사 정산 원천 수집. 두 갈래를 한 형태(SourceSale)로 모아 계산 엔진에 넘긴다.
//   ① payments — 학습 플랫폼 구독 직접 결제(주문 없이 단건 결제). ★order_id 가 있는 결제는 제외한다.
//      같은 매출이 order_items 로도 잡혀 이중 계상되기 때문(장바구니 결제는 plan_id 가 비어 있어
//      과목·상품 규칙에 걸리지도 않았다 — 주문 항목 쪽이 정확하다).
//   ② order_items — 강의 플랫폼 주문의 강의(plan)·수강연장(course_extension) 항목.
//      도서(book)는 별도 도서정산(book_settlements, payee=저자/출판사) 소관이라 제외.
//
// 금액 규칙
//   · 결제액 = 항목 단가×수량 − 주문 쿠폰할인 안분분. 배송비는 정산 대상이 아니다(택배사 통과금).
//     order_items.unit_price_krw 는 할인 전 가격이고 할인은 주문 단위(orders.coupon_discount_krw)라
//     항목별로 나눠 붙여야 실제 입금액과 맞는다. 안분은 주문의 모든 항목(도서 포함) 정가 비율,
//     마지막 항목이 반올림 잔액을 흡수한다(장바구니 세트 안분과 같은 방식).
//   · 환불액도 같은 비율로 축소해 전액 환불이 결제액을 정확히 상쇄하게 한다
//     (order_items.refund_amount_krw 는 할인 전 금액으로 기록된다).
//   · ★도서정산(book-settlements-admin.server)은 할인을 빼지 않고 **정가**를 기준으로 쓴다.
//     원장 결정(2026-09-12): 두 정산의 기준이 다른 것이 맞다 — 통일하지 말 것.
//   · 월 귀속: 결제는 orders.paid_at(무통장은 입금 확인 시각) / payments.created_at, 환불은 refunded_at.
import adminClient from "~/core/lib/supa-admin-client.server";

import {
  type EngineRule,
  type SourceSale,
  allocateDiscount,
  scaleRefund,
} from "./settlement-engine";

/** 강사 정산 대상 주문 항목 유형 — 도서는 도서정산 소관이라 제외. */
const SETTLED_ITEM_TYPES = ["plan", "course_extension"];
const PAID_ORDER_STATUSES = ["paid", "partially_refunded", "refunded"];

export interface MonthSources {
  sales: SourceSale[];
  refunds: SourceSale[];
  rules: EngineRule[];
  planSubjects: Map<string, string[]>;
  planInstructors: Map<string, Map<string, number>>;
}

interface PaymentRow {
  payment_id: string;
  plan_id: string | null;
  amount_krw: number;
  subject_code: string | null;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  created_at: string;
  subscription_plans: { name: string } | null;
  profiles: { name: string | null } | null;
}

const PAYMENT_SELECT =
  "payment_id, plan_id, amount_krw, subject_code, refunded_at, refund_amount_krw, created_at, " +
  "subscription_plans(name), profiles!payments_user_id_fkey(name)";

interface OrderItemRow {
  order_item_id: string;
  order_id: string;
  item_type: string;
  plan_id: string | null;
  subject_code: string | null;
  quantity: number;
  unit_price_krw: number;
  title_snapshot: string | null;
  refunded_at: string | null;
  refund_amount_krw: number | null;
  orders: {
    paid_at: string | null;
    status: string;
    coupon_discount_krw: number | null;
    profiles: { name: string | null } | null;
  } | null;
}

const ORDER_ITEM_SELECT =
  "order_item_id, order_id, item_type, plan_id, subject_code, quantity, unit_price_krw, " +
  "title_snapshot, refunded_at, refund_amount_krw, " +
  "orders!inner(paid_at, status, coupon_discount_krw, profiles!orders_user_id_fkey(name))";

function paymentToSale(r: PaymentRow): SourceSale {
  return {
    sourceKind: "payment",
    sourceId: r.payment_id,
    planId: r.plan_id,
    subjectCode: r.subject_code,
    grossKrw: r.amount_krw,
    paidAt: r.created_at,
    refundedAt: r.refunded_at,
    refundKrw: r.refund_amount_krw ?? (r.refunded_at ? r.amount_krw : 0),
    label: r.subscription_plans?.name ?? null,
    studentName: r.profiles?.name ?? null,
  };
}

/**
 * 주문별 쿠폰할인 안분표 — orderItemId → 할인 적용 후 항목 금액.
 * 분모는 주문의 모든 항목(도서 포함) 정가 합. 마지막 항목이 반올림 잔액을 흡수한다.
 */
async function netLineMap(orderIds: string[]): Promise<Map<string, number>> {
  const net = new Map<string, number>();
  if (orderIds.length === 0) return net;
  const { data, error } = await adminClient
    .from("order_items")
    .select(
      "order_item_id, order_id, unit_price_krw, quantity, orders!inner(coupon_discount_krw)",
    )
    .in("order_id", orderIds)
    .limit(50000);
  if (error) throw error;
  const byOrder = new Map<
    string,
    { id: string; gross: number; discount: number }[]
  >();
  for (const r of (data ?? []) as unknown as Array<{
    order_item_id: string;
    order_id: string;
    unit_price_krw: number;
    quantity: number;
    orders: { coupon_discount_krw: number | null } | null;
  }>) {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
    byOrder.get(r.order_id)!.push({
      id: r.order_item_id,
      gross: (r.unit_price_krw ?? 0) * (r.quantity ?? 1),
      discount: r.orders?.coupon_discount_krw ?? 0,
    });
  }
  for (const rows of byOrder.values()) {
    // 정렬 고정 — 잔액 흡수 항목이 실행마다 바뀌면 재생성 결과가 흔들린다.
    rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const allocated = allocateDiscount(rows, rows[0]?.discount ?? 0);
    for (const [id, value] of allocated) net.set(id, value);
  }
  return net;
}

function orderItemToSale(r: OrderItemRow, netKrw: number): SourceSale {
  const gross = (r.unit_price_krw ?? 0) * (r.quantity ?? 1);
  const rawRefund = r.refunded_at ? (r.refund_amount_krw ?? gross) : 0;
  // 환불도 할인 적용 후 금액 기준으로 축소 — 전액 환불이 결제액을 정확히 상쇄한다.
  const refundKrw = scaleRefund(rawRefund, netKrw, gross);
  return {
    sourceKind: "order_item",
    sourceId: r.order_item_id,
    planId: r.plan_id,
    subjectCode: r.subject_code,
    grossKrw: netKrw,
    paidAt: r.orders?.paid_at ?? "",
    refundedAt: r.refunded_at,
    refundKrw,
    label:
      r.title_snapshot ??
      (r.item_type === "course_extension" ? "수강 연장" : null),
    studentName: r.orders?.profiles?.name ?? null,
  };
}

/** 상품(plan) → 담당 강사 안분 비율. 분모는 상품에 묶인 강의 전체(담당자 미지정 강의 포함). */
async function loadPlanInstructors(): Promise<
  Map<string, Map<string, number>>
> {
  const { data, error } = await adminClient
    .from("plan_courses")
    .select(
      "plan_id, courses!inner(course_id, deleted_at, course_series!inner(instructor_id, deleted_at))",
    )
    .limit(5000);
  if (error) throw error;
  const counts = new Map<
    string,
    { total: number; byInstructor: Map<string, number> }
  >();
  for (const r of (data ?? []) as unknown as Array<{
    plan_id: string;
    courses: {
      deleted_at: string | null;
      course_series: {
        instructor_id: string | null;
        deleted_at: string | null;
      } | null;
    } | null;
  }>) {
    if (!r.courses || r.courses.deleted_at) continue;
    const series = r.courses.course_series;
    if (series?.deleted_at) continue;
    if (!counts.has(r.plan_id))
      counts.set(r.plan_id, { total: 0, byInstructor: new Map() });
    const entry = counts.get(r.plan_id)!;
    entry.total += 1;
    const instructorId = series?.instructor_id ?? null;
    if (instructorId)
      entry.byInstructor.set(
        instructorId,
        (entry.byInstructor.get(instructorId) ?? 0) + 1,
      );
  }
  const out = new Map<string, Map<string, number>>();
  for (const [planId, entry] of counts) {
    if (entry.total === 0 || entry.byInstructor.size === 0) continue;
    const portions = new Map<string, number>();
    for (const [instructorId, n] of entry.byInstructor)
      portions.set(instructorId, n / entry.total);
    out.set(planId, portions);
  }
  return out;
}

export async function loadMonthSources(
  fromIso: string,
  toIso: string,
): Promise<MonthSources> {
  const [
    paySalesRes,
    payRefundRes,
    itemSalesRes,
    itemRefundRes,
    ruleRes,
    planRes,
    planInstructors,
  ] = await Promise.all([
    adminClient
      .from("payments")
      .select(PAYMENT_SELECT)
      .is("order_id", null)
      .in("status", ["completed", "refunded"])
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(20000),
    adminClient
      .from("payments")
      .select(PAYMENT_SELECT)
      .is("order_id", null)
      .not("refunded_at", "is", null)
      .gte("refunded_at", fromIso)
      .lt("refunded_at", toIso)
      .limit(20000),
    adminClient
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .in("item_type", SETTLED_ITEM_TYPES)
      .in("orders.status", PAID_ORDER_STATUSES)
      .gte("orders.paid_at", fromIso)
      .lt("orders.paid_at", toIso)
      .limit(20000),
    adminClient
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .in("item_type", SETTLED_ITEM_TYPES)
      .in("orders.status", PAID_ORDER_STATUSES)
      .not("refunded_at", "is", null)
      .gte("refunded_at", fromIso)
      .lt("refunded_at", toIso)
      .limit(20000),
    adminClient
      .from("instructor_share_rules")
      .select(
        "rule_id, instructor_id, target_kind, target_plan_id, target_subject_code, share_kind, share_value, effective_from, created_at",
      )
      .eq("is_active", true)
      .limit(1000),
    adminClient
      .from("subscription_plans")
      .select("plan_id, subject_codes")
      .limit(500),
    loadPlanInstructors(),
  ]);
  for (const r of [
    paySalesRes,
    payRefundRes,
    itemSalesRes,
    itemRefundRes,
    ruleRes,
    planRes,
  ]) {
    if (r.error) throw r.error;
  }

  const itemSales = (itemSalesRes.data ?? []) as unknown as OrderItemRow[];
  const itemRefunds = (itemRefundRes.data ?? []) as unknown as OrderItemRow[];
  const net = await netLineMap([
    ...new Set([...itemSales, ...itemRefunds].map((r) => r.order_id)),
  ]);
  const netOf = (r: OrderItemRow) =>
    net.get(r.order_item_id) ?? (r.unit_price_krw ?? 0) * (r.quantity ?? 1);

  return {
    sales: [
      ...((paySalesRes.data ?? []) as unknown as PaymentRow[]).map(
        paymentToSale,
      ),
      // paid_at 이 비어 있으면 월 귀속을 정할 수 없다 — 쿼리에서 이미 걸러지지만 방어적으로 제외.
      ...itemSales
        .filter((r) => r.orders?.paid_at)
        .map((r) => orderItemToSale(r, netOf(r))),
    ],
    refunds: [
      ...((payRefundRes.data ?? []) as unknown as PaymentRow[]).map(
        paymentToSale,
      ),
      ...itemRefunds.map((r) => orderItemToSale(r, netOf(r))),
    ],
    rules: (ruleRes.data ?? []) as unknown as EngineRule[],
    planSubjects: new Map<string, string[]>(
      (planRes.data ?? []).map((p) => [
        p.plan_id,
        (p.subject_codes ?? []) as string[],
      ]),
    ),
    planInstructors,
  };
}

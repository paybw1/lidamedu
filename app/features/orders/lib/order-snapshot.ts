// 결제 당시 스냅샷 — 주문 항목에 굳혀 넣을 값들 (feat-11-013 P1, 요청서 §11-1).
//
// ★요청서 11-1 이 못 박는다: 「환불 계산은 현재 상품정보가 아니라 **결제 당시 저장된** 값을
//   기준으로 한다. 이후 상품정보가 수정되어도 과거 주문의 환불 기준은 변경되면 안 된다.」
//   종전에는 수강정책을 plan_policies 에서 **실시간으로** 읽었으므로, 상품을 고치면 기존
//   수강생의 환불 판정이 즉시 바뀌었다.
//
// ★이 파일은 순수 계산만 한다(DB 접근 0). 값을 모으는 일은 orders.server 가 하고,
//   나중에 환불 계산기가 이 값을 읽는다. 선례: lms/lib/play-limit.ts.
//
// ★★쿠폰 배분 규칙을 새로 만들지 않는다 — 정산이 이미 쓰는 allocateDiscount 를 그대로 쓴다.
//   그 규칙(판매금액 비율 배분 · 원 단위 차액은 마지막 항목이 흡수)이 요청서 11-10 과
//   **글자 그대로 같다**. 복제하면 정산과 환불이 서로 다른 금액을 말하게 된다.

import { allocateDiscount } from "~/features/subscriptions/settlement-engine";

/** 배분 전 한 항목. id 는 배분 결과를 되받을 키(주문 생성 전이라 order_item_id 가 아직 없다). */
export interface AllocInputItem {
  id: string;
  /** 할인 전 판매금액 = 단가 × 수량. */
  grossKrw: number;
}

/** 한 항목에 배분된 결과. */
export interface AllocResult {
  couponKrw: number;
  pointKrw: number;
  /** 실제 PG 결제 귀속액 = gross − coupon − point. 환불 상한의 권위. */
  paidKrw: number;
}

/**
 * 주문 단위 할인(쿠폰·포인트)을 항목별로 배분한다.
 *
 * ★배송비는 배분하지 않는다 — 항목에 귀속되는 금액이 아니고, 요청서도 배송비를
 *   별도 공제항목(교재 반품비)으로 다룬다. 따라서 `Σ paidKrw + 배송비 = 주문 총액`.
 * ★정렬을 고정한다. 차액을 흡수하는 항목이 실행마다 바뀌면 같은 주문을 다시 계산했을 때
 *   금액이 흔들린다(정산의 같은 주석 참조).
 */
export function allocateOrderDiscounts(input: {
  items: AllocInputItem[];
  couponDiscountKrw: number;
  pointAmountKrw: number;
}): Map<string, AllocResult> {
  const rows = [...input.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // ★allocateDiscount 는 `gross` 라는 이름을 쓴다(정산 쪽 표기). 여기서만 맞춰 넘긴다.
  const coupon = allocateDiscount(
    rows.map((r) => ({ id: r.id, gross: r.grossKrw })),
    Math.max(0, input.couponDiscountKrw),
  );
  const out = new Map<string, AllocResult>();

  // ★포인트는 **쿠폰을 뺀 뒤 남은 금액**을 기준으로 배분한다. 쿠폰과 같은 모수로 배분하면
  //   둘의 합이 항목 금액을 넘어 paid 가 음수가 될 수 있다.
  const point = allocateDiscount(
    rows.map((r) => ({ id: r.id, gross: coupon.get(r.id) ?? r.grossKrw })),
    Math.max(0, input.pointAmountKrw),
  );

  for (const r of rows) {
    const afterCouponKrw = coupon.get(r.id) ?? r.grossKrw;
    const paidKrw = point.get(r.id) ?? afterCouponKrw;
    out.set(r.id, {
      couponKrw: r.grossKrw - afterCouponKrw,
      pointKrw: afterCouponKrw - paidKrw,
      paidKrw,
    });
  }
  return out;
}

/** 환불 계산유형 — order_items.refund_calc_type 의 값. */
export type RefundCalcType = "period" | "single" | "bundle" | "custom";

/**
 * 환불 계산유형을 정한다 (요청서 11-2 우선순위 · 11-6~11-9).
 *
 * - `custom`  — 결제 당시 상품 안내에 **별도 환불규정**이 고지돼 있었다(우선순위 1번)
 * - `bundle`  — 구성 강의가 여럿인 패키지. 요청서 11-9: 구성 일부만 환불 불가
 * - `single`  — 전체 예정 회차(T)가 고지된 단과. 일수 기준과 **회차 기준 중 큰 공제액**을 쓴다
 * - `period`  — 그 외. 일수 기준만 쓴다(기간제)
 *
 * ★도서에는 쓰지 않는다(null) — 교재는 수강분 공제가 아니라 반품 규정을 탄다.
 */
export function refundCalcTypeOf(input: {
  hasCustomPolicy: boolean;
  courseCount: number;
  plannedSessions: number | null;
}): RefundCalcType {
  if (input.hasCustomPolicy) return "custom";
  if (input.courseCount > 1) return "bundle";
  if (input.plannedSessions != null && input.plannedSessions > 0) return "single";
  return "period";
}

/**
 * 항목의 실제 결제 귀속액을 낸다 — **스냅샷이 있으면 그것, 없으면 즉석 배분**.
 *
 * ★스냅샷 칸이 생기기 전(2026-09-14 이전) 주문에는 `paid_amount_krw` 가 없다. 그런 주문도
 *   환불이 되어야 하므로 정산과 **같은 규칙**으로 그 자리에서 배분해 쓴다.
 * ★★이 함수가 P0-1 의 근본 해결이다 — 종전에는 환불액을 `단가 × 수량`(할인 **전** 금액)으로
 *   잡아 토스에 보냈다. 쿠폰이 붙은 주문이면 단건은 취소가능잔액을 넘어 **거절**되고,
 *   다건이면 앞 항목이 **실제 돈을 과환불**했다.
 */
export function itemPaidAmountKrw(input: {
  /** 이 항목의 스냅샷 값(없으면 null). */
  paidAmountSnapshotKrw: number | null;
  /** 이 항목의 할인 전 금액(단가 × 수량). */
  grossKrw: number;
  /** 같은 주문의 모든 항목(자기 포함) — 스냅샷이 없을 때만 쓴다. */
  siblings: AllocInputItem[];
  /** 이 항목의 id(= siblings 안의 키). */
  id: string;
  couponDiscountKrw: number;
  pointAmountKrw: number;
}): number {
  if (input.paidAmountSnapshotKrw != null) return input.paidAmountSnapshotKrw;
  const alloc = allocateOrderDiscounts({
    items: input.siblings,
    couponDiscountKrw: input.couponDiscountKrw,
    pointAmountKrw: input.pointAmountKrw,
  });
  return alloc.get(input.id)?.paidKrw ?? input.grossKrw;
}

// 결제 스냅샷 배분 테스트 (feat-11-013 P1).
//
// ★못박는 것은 **돈의 보존**이다 — 배분한 금액의 합이 원래 금액과 정확히 같아야 한다.
//   한 원이라도 새면 「환불 누적이 결제액을 넘는다」(요청서 §10) 또는 「환불이 거절된다」로
//   나타난다. 반올림으로 생기는 차액을 어디가 흡수하는지까지 못박는다.

import { describe, expect, it } from "vitest";

import {
  allocateOrderDiscounts,
  itemPaidAmountKrw,
  refundCalcTypeOf,
} from "./order-snapshot";

const sum = (m: Map<string, { paidKrw: number }>) =>
  [...m.values()].reduce((s, v) => s + v.paidKrw, 0);

describe("allocateOrderDiscounts — 쿠폰·포인트 항목 배분", () => {
  it("할인이 없으면 판매금액이 그대로 결제액", () => {
    const r = allocateOrderDiscounts({
      items: [
        { id: "a", grossKrw: 300_000 },
        { id: "b", grossKrw: 9_900 },
      ],
      couponDiscountKrw: 0,
      pointAmountKrw: 0,
    });
    expect(r.get("a")?.paidKrw).toBe(300_000);
    expect(r.get("b")?.paidKrw).toBe(9_900);
    expect(r.get("a")?.couponKrw).toBe(0);
  });

  it("★쿠폰은 판매금액 비율로 배분되고 합계가 보존된다", () => {
    const items = [
      { id: "a", grossKrw: 300_000 },
      { id: "b", grossKrw: 100_000 },
    ];
    const r = allocateOrderDiscounts({
      items,
      couponDiscountKrw: 40_000,
      pointAmountKrw: 0,
    });
    // 3:1 비율 → 30,000 / 10,000
    expect(r.get("a")?.couponKrw).toBe(30_000);
    expect(r.get("b")?.couponKrw).toBe(10_000);
    expect(sum(r)).toBe(400_000 - 40_000);
  });

  it("★원 단위로 안 떨어져도 총합은 정확하다 — 차액은 마지막 항목이 흡수", () => {
    const items = [
      { id: "a", grossKrw: 10_000 },
      { id: "b", grossKrw: 10_000 },
      { id: "c", grossKrw: 10_000 },
    ];
    const r = allocateOrderDiscounts({
      items,
      couponDiscountKrw: 1_000, // 3으로 안 나뉜다
      pointAmountKrw: 0,
    });
    const coupons = ["a", "b", "c"].map((k) => r.get(k)!.couponKrw);
    expect(coupons.reduce((s, v) => s + v, 0)).toBe(1_000);
    expect(sum(r)).toBe(30_000 - 1_000);
  });

  it("★포인트는 쿠폰을 뺀 나머지를 모수로 배분한다 — 결제액이 음수가 되지 않는다", () => {
    const r = allocateOrderDiscounts({
      items: [
        { id: "a", grossKrw: 10_000 },
        { id: "b", grossKrw: 10_000 },
      ],
      couponDiscountKrw: 10_000,
      pointAmountKrw: 10_000,
    });
    for (const v of r.values()) {
      expect(v.paidKrw).toBeGreaterThanOrEqual(0);
      expect(v.couponKrw + v.pointKrw + v.paidKrw).toBe(10_000);
    }
    expect(sum(r)).toBe(0);
  });

  it("할인이 판매금액을 넘어도 결제액은 0 아래로 안 내려간다", () => {
    const r = allocateOrderDiscounts({
      items: [{ id: "a", grossKrw: 5_000 }],
      couponDiscountKrw: 99_000,
      pointAmountKrw: 0,
    });
    expect(r.get("a")?.paidKrw).toBe(0);
    expect(r.get("a")?.couponKrw).toBe(5_000);
  });

  it("항목 순서가 뒤바뀌어도 같은 결과 — 차액 흡수 항목이 흔들리지 않는다", () => {
    const mk = (items: { id: string; grossKrw: number }[]) =>
      allocateOrderDiscounts({ items, couponDiscountKrw: 1_000, pointAmountKrw: 0 });
    const forward = mk([
      { id: "a", grossKrw: 10_000 },
      { id: "b", grossKrw: 10_000 },
      { id: "c", grossKrw: 10_000 },
    ]);
    const backward = mk([
      { id: "c", grossKrw: 10_000 },
      { id: "b", grossKrw: 10_000 },
      { id: "a", grossKrw: 10_000 },
    ]);
    for (const k of ["a", "b", "c"]) {
      expect(forward.get(k)?.paidKrw).toBe(backward.get(k)?.paidKrw);
    }
  });
});

describe("itemPaidAmountKrw — 스냅샷 우선, 없으면 즉석 배분", () => {
  const siblings = [
    { id: "a", grossKrw: 300_000 },
    { id: "b", grossKrw: 100_000 },
  ];

  it("스냅샷이 있으면 그대로 쓴다", () => {
    expect(
      itemPaidAmountKrw({
        paidAmountSnapshotKrw: 271_000,
        grossKrw: 300_000,
        siblings,
        id: "a",
        couponDiscountKrw: 40_000,
        pointAmountKrw: 0,
      }),
    ).toBe(271_000);
  });

  it("★스냅샷이 없는 옛 주문도 같은 규칙으로 계산된다 — 환불이 막히지 않아야 한다", () => {
    expect(
      itemPaidAmountKrw({
        paidAmountSnapshotKrw: null,
        grossKrw: 300_000,
        siblings,
        id: "a",
        couponDiscountKrw: 40_000,
        pointAmountKrw: 0,
      }),
    ).toBe(270_000);
  });

  it("★쿠폰이 없으면 판매금액과 같다 — 종전 동작과 어긋나지 않는다", () => {
    expect(
      itemPaidAmountKrw({
        paidAmountSnapshotKrw: null,
        grossKrw: 300_000,
        siblings,
        id: "a",
        couponDiscountKrw: 0,
        pointAmountKrw: 0,
      }),
    ).toBe(300_000);
  });

  it("스냅샷 0원은 null 과 다르다 — 전액 포인트 결제를 0으로 읽어야 한다", () => {
    expect(
      itemPaidAmountKrw({
        paidAmountSnapshotKrw: 0,
        grossKrw: 10_000,
        siblings: [{ id: "a", grossKrw: 10_000 }],
        id: "a",
        couponDiscountKrw: 0,
        pointAmountKrw: 10_000,
      }),
    ).toBe(0);
  });
});

describe("refundCalcTypeOf — 계산유형 판정 (요청서 11-2)", () => {
  it("별도 환불규정이 있으면 무조건 custom — 우선순위 1번", () => {
    expect(
      refundCalcTypeOf({ hasCustomPolicy: true, courseCount: 3, plannedSessions: 30 }),
    ).toBe("custom");
  });

  it("구성 강의가 여럿이면 bundle — 일부만 환불 못 하는 묶음", () => {
    expect(
      refundCalcTypeOf({ hasCustomPolicy: false, courseCount: 3, plannedSessions: 30 }),
    ).toBe("bundle");
  });

  it("★예정 회차가 고지된 단과는 single — 회차 기준 공제가 가능하다", () => {
    expect(
      refundCalcTypeOf({ hasCustomPolicy: false, courseCount: 1, plannedSessions: 30 }),
    ).toBe("single");
  });

  it("예정 회차가 없으면 period — 일수 기준만 쓴다", () => {
    expect(
      refundCalcTypeOf({ hasCustomPolicy: false, courseCount: 1, plannedSessions: null }),
    ).toBe("period");
    expect(
      refundCalcTypeOf({ hasCustomPolicy: false, courseCount: 1, plannedSessions: 0 }),
    ).toBe("period");
  });
});

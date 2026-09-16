import { describe, expect, it } from "vitest";

import { computeRefund, type RefundCalcInput } from "./refund-calc";

/** 기본값 — 각 테스트는 필요한 칸만 덮어쓴다. */
function input(over: Partial<RefundCalcInput> = {}): RefundCalcInput {
  return {
    calcType: "period",
    baseKrw: 100_000,
    listPriceKrw: null,
    couponKrw: 0,
    pointKrw: 0,
    pgPaidKrw: 100_000,
    durationDays: 100,
    usedDays: 0,
    plannedSessions: null,
    usedSessions: 0,
    withinFirstWeek: false,
    notStarted: false,
    noPaidUsage: false,
    hasOwnPolicy: false,
    ...over,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ★요청서 §12 — 이 요청서에서 **유일하게 정답이 주어진 부분**이다.
//   식을 고칠 일이 있으면 이 두 테스트가 먼저 깨져야 한다.
// ────────────────────────────────────────────────────────────────────────────
describe("★요청서 §12 개발 검증 예시", () => {
  it("예시 A · 기간제 상품 → 150,000원", () => {
    const r = computeRefund(
      input({
        calcType: "period",
        baseKrw: 300_000,
        listPriceKrw: 600_000,
        durationDays: 100,
        usedDays: 20,
        couponKrw: 30_000,
        pgPaidKrw: 270_000, // 300,000 − 쿠폰 30,000
      }),
    );
    // 1일 이용대금 600,000 ÷ 100 = 6,000 → 이용 공제액 6,000 × 20 = 120,000
    expect(r.dayDeductionKrw).toBe(120_000);
    expect(r.appliedDeductionKrw).toBe(120_000);
    // 환불금액 = 300,000 − 120,000 − 30,000 = 150,000
    expect(r.refundableKrw).toBe(150_000);
    expect(r.finalRefundKrw).toBe(150_000);
    expect(r.verdict).toBe("partial");
  });

  it("예시 B · 단과 상품 → 100,000원 (회차 기준이 더 커서 채택)", () => {
    const r = computeRefund(
      input({
        calcType: "single",
        baseKrw: 200_000,
        listPriceKrw: 300_000,
        durationDays: 60,
        usedDays: 10,
        plannedSessions: 30,
        usedSessions: 8,
        couponKrw: 20_000,
        pgPaidKrw: 180_000,
      }),
    );
    expect(r.dayDeductionKrw).toBe(50_000); // 300,000 ÷ 60 × 10
    expect(r.sessionDeductionKrw).toBe(80_000); // 300,000 ÷ 30 × 8
    expect(r.appliedDeductionKrw).toBe(80_000); // MAX
    expect(r.deductionBasis).toBe("session");
    // 환불금액 = 200,000 − 80,000 − 20,000 = 100,000
    expect(r.refundableKrw).toBe(100_000);
    expect(r.finalRefundKrw).toBe(100_000);
  });
});

describe("판정 우선순위 (요청서 11-2)", () => {
  it("상품별 별도 환불규정이 있으면 자동계산하지 않는다", () => {
    const r = computeRefund(input({ hasOwnPolicy: true, withinFirstWeek: true, noPaidUsage: true }));
    expect(r.verdict).toBe("manual");
    expect(r.finalRefundKrw).toBe(0);
  });

  it("calcType 이 custom 이어도 자동계산 대상이 아니다", () => {
    expect(computeRefund(input({ calcType: "custom" })).verdict).toBe("manual");
  });

  it("7일 이내 + 유료 이용이력 없음 → 전액환불 (공제 없음, 쿠폰만 차감)", () => {
    const r = computeRefund(
      input({
        baseKrw: 300_000,
        listPriceKrw: 600_000,
        couponKrw: 30_000,
        usedDays: 5,
        withinFirstWeek: true,
        noPaidUsage: true,
        pgPaidKrw: 270_000,
      }),
    );
    expect(r.verdict).toBe("full");
    expect(r.appliedDeductionKrw).toBe(0);
    expect(r.refundableKrw).toBe(270_000); // 300,000 − 30,000
  });

  it("★이용 시작 전 접수 + 이용이력 없음 → 전액환불, 사유는 「이용 시작 전」(feat-11-013 P3-b)", () => {
    // 개강 전 결제(usage_starts_at = 개강일 미래)·연장 재구매(이용 시작 = 기존 만료일)는
    // elapsedDays 0 이라 종전에는 D·T 없는 정규 상품이 manual 로 떨어졌다.
    const r = computeRefund(
      input({ withinFirstWeek: true, notStarted: true, noPaidUsage: true, durationDays: null }),
    );
    expect(r.verdict).toBe("full");
    expect(r.verdictReason).toContain("이용 시작 전");
    expect(r.refundableKrw).toBe(100_000);
  });

  it("이용 시작 전이라도 유료 이용이력이 있으면 전액환불이 아니다(D·T 없으면 manual, 사유에 시작 전 표기)", () => {
    const r = computeRefund(
      input({ withinFirstWeek: true, notStarted: true, noPaidUsage: false, durationDays: null }),
    );
    expect(r.verdict).toBe("manual");
    expect(r.verdictReason).toContain("이용 시작 전 접수");
  });

  it("7일 이내라도 유료 이용이력이 있으면 계산식으로 간다", () => {
    const r = computeRefund(
      input({ usedDays: 5, withinFirstWeek: true, noPaidUsage: false, listPriceKrw: 100_000 }),
    );
    expect(r.verdict).toBe("partial");
    expect(r.appliedDeductionKrw).toBeGreaterThan(0);
  });

  it("★기간제는 이용일수 × 2 ≥ 정가 수강기간이면 환불 불가", () => {
    expect(computeRefund(input({ durationDays: 100, usedDays: 50 })).verdict).toBe("blocked");
    expect(computeRefund(input({ durationDays: 100, usedDays: 49 })).verdict).toBe("partial");
  });

  it("1/2 경과 규칙은 단과에 걸지 않는다 (요청서가 11-6 기간제 아래에 뒀다)", () => {
    const r = computeRefund(
      input({
        calcType: "single",
        baseKrw: 200_000,
        listPriceKrw: 300_000,
        durationDays: 60,
        usedDays: 35, // 35 × 2 ≥ 60 — 기간제였다면 여기서 환불 불가로 끊겼다
        plannedSessions: 30,
        usedSessions: 1,
      }),
    );
    // 끊기지 않고 계산식까지 간다.
    expect(r.verdictReason).not.toContain("1/2");
    expect(r.dayDeductionKrw).toBe(175_000); // 300,000 ÷ 60 × 35
    expect(r.refundableKrw).toBe(25_000); // 200,000 − 175,000
    expect(r.verdict).toBe("partial");
    // 같은 값을 기간제로 넣으면 환불 불가다 — 차이가 이 규칙의 범위다.
    expect(computeRefund(input({ durationDays: 60, usedDays: 35 })).verdict).toBe("blocked");
  });
});

describe("반올림 — 최종 공제액에서 한 번만 절사 (요청서 11-15)", () => {
  it("★하루치를 먼저 절사하면 안 된다 — floor(N÷D×d) ≠ floor(N÷D)×d", () => {
    const r = computeRefund(
      input({ baseKrw: 100_000, listPriceKrw: 100_000, durationDays: 7, usedDays: 3 }),
    );
    // floor(100,000 × 3 ÷ 7) = 42,857.  하루치 먼저 절사하면 floor(100,000÷7)×3 = 42,855.
    expect(r.dayDeductionKrw).toBe(42_857);
    expect(r.dayDeductionKrw).not.toBe(Math.floor(100_000 / 7) * 3);
  });

  it("공제액과 쿠폰이 결제기준금액을 넘으면 0원 (음수 금지)", () => {
    const r = computeRefund(
      input({ baseKrw: 100_000, listPriceKrw: 900_000, durationDays: 10, usedDays: 9 }),
    );
    expect(r.refundableKrw).toBe(0);
    expect(r.finalRefundKrw).toBe(0);
    expect(r.verdict).toBe("blocked");
  });

  it("정상가가 없으면 결제기준금액을 정상가로 쓴다 (할인 없는 상품)", () => {
    const r = computeRefund(
      input({ baseKrw: 50_000, listPriceKrw: null, durationDays: 10, usedDays: 2 }),
    );
    expect(r.listPriceKrw).toBe(50_000);
    expect(r.dayDeductionKrw).toBe(10_000);
  });

  it("★분모(D·T)가 둘 다 없으면 계산한 척하지 않고 manual 로 돌려보낸다", () => {
    // 종전에는 공제 0 → 전액환불이 나오면서 사유는 「기간제 계산식 적용」이라, 관리자가
    // 눈치챌 단서가 없었다. 그 손해는 학원이 본다.
    const r = computeRefund(
      input({ baseKrw: 300_000, listPriceKrw: 600_000, durationDays: null, plannedSessions: null, usedDays: 40 }),
    );
    expect(r.verdict).toBe("manual");
    expect(r.finalRefundKrw).toBe(0);
    expect(r.verdictReason).toContain("직접 입력");
  });

  it("분모가 하나라도 있으면 그대로 계산한다", () => {
    const withDays = computeRefund(
      input({ calcType: "single", baseKrw: 300_000, listPriceKrw: 600_000, durationDays: 100, plannedSessions: null, usedDays: 20 }),
    );
    expect(withDays.verdict).toBe("partial");
    const withSessions = computeRefund(
      input({ calcType: "single", baseKrw: 300_000, listPriceKrw: 600_000, durationDays: null, plannedSessions: 30, usedSessions: 5 }),
    );
    expect(withSessions.verdict).toBe("partial");
    expect(withSessions.sessionDeductionKrw).toBe(100_000);
  });

  it("수강 시작 전이면 이용일수 0 → 공제 0", () => {
    const r = computeRefund(input({ usedDays: 0, listPriceKrw: 600_000 }));
    expect(r.dayDeductionKrw).toBe(0);
    expect(r.refundableKrw).toBe(100_000);
  });
});

describe("포인트·PG 분배 (요청서 11-11)", () => {
  it("포인트 반환액 = MIN(사용 포인트, 환불 대상금액), 나머지가 토스 취소 예정금액", () => {
    const r = computeRefund(
      input({
        baseKrw: 100_000,
        listPriceKrw: 100_000,
        durationDays: 10,
        usedDays: 2,
        pointKrw: 30_000,
        pgPaidKrw: 70_000,
      }),
    );
    expect(r.refundableKrw).toBe(80_000); // 100,000 − 20,000
    expect(r.pointReturnKrw).toBe(30_000);
    expect(r.pgCancelPlanKrw).toBe(50_000);
    expect(r.pointReturnKrw + r.pgCancelPlanKrw).toBe(r.finalRefundKrw);
  });

  it("사용 포인트가 환불 대상금액보다 크면 전부 포인트로 돌려준다", () => {
    const r = computeRefund(
      input({
        // ★기간제로 두면 9일 × 2 ≥ 10일이라 1/2 규칙에 먼저 걸린다. 단과로 계산식을 태운다.
        calcType: "single",
        baseKrw: 100_000,
        listPriceKrw: 100_000,
        durationDays: 10,
        usedDays: 9,
        pointKrw: 50_000,
        pgPaidKrw: 50_000,
      }),
    );
    expect(r.refundableKrw).toBe(10_000);
    expect(r.pointReturnKrw).toBe(10_000);
    expect(r.pgCancelPlanKrw).toBe(0);
  });

  it("★2차 환불 — pointKrw 는 배분액이 아니라 **잔여**다(P8-a)", () => {
    // 배분 30,000 중 1차 환불에서 20,000 을 이미 돌려줬다면 어댑터가 잔여 10,000 을 먹인다.
    // 원값 30,000 을 먹이면 화면이 이미 돌려준 몫을 또 제안하고, RPC 는 잔여로 캡을 걸어
    // **화면과 원장이 다시 갈린다** — 이 파일이 지킬 수 있는 절반이 이 계약이다.
    const r = computeRefund(
      input({
        calcType: "single",
        baseKrw: 100_000,
        listPriceKrw: 100_000,
        durationDays: 10,
        usedDays: 9,
        pointKrw: 10_000, // ← 잔여
        pgPaidKrw: 50_000,
      }),
    );
    expect(r.refundableKrw).toBe(10_000);
    expect(r.pointReturnKrw).toBe(10_000);
    expect(r.pgCancelPlanKrw).toBe(0);
    expect(r.pointReturnKrw + r.pgCancelPlanKrw).toBe(r.finalRefundKrw);
  });

  it("★토스 취소 예정금액은 실제 PG 결제금액을 넘지 못한다", () => {
    const r = computeRefund(
      input({ baseKrw: 100_000, listPriceKrw: 100_000, usedDays: 0, pgPaidKrw: 60_000 }),
    );
    expect(r.refundableKrw).toBe(100_000);
    expect(r.pgCancelPlanKrw).toBe(60_000); // 100,000 이 아니라 상한에서 잘린다
    expect(r.finalRefundKrw).toBe(60_000);
  });
});

describe("산출근거 (요청서 11-13)", () => {
  it("계산식을 줄 단위로 내놓는다", () => {
    const r = computeRefund(
      input({
        calcType: "single",
        baseKrw: 200_000,
        listPriceKrw: 300_000,
        durationDays: 60,
        usedDays: 10,
        plannedSessions: 30,
        usedSessions: 8,
        couponKrw: 20_000,
        pgPaidKrw: 180_000,
      }),
    );
    expect(r.formula.length).toBeGreaterThanOrEqual(4);
    expect(r.formula.some((l) => l.includes("MAX"))).toBe(true);
    expect(r.formula.at(-1)).toContain("토스 취소 예정금액");
    expect(r.elapsedRatio).toBeCloseTo(10 / 60);
  });
});

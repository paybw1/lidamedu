// feat-8-031 — 정산 계산 엔진 단위 테스트.
// 운영 DB 에는 배분 규칙이 아직 0건이라 실데이터 스모크로는 산식이 검증되지 않는다.
// 원장 확정 산식을 여기서 못박는다:
//   수수료 = (결제 − 환불) × 수수료율 / 매출 = 결제 − 환불 − 수수료
//   정산금액 = 매출 × 정산비율 / 세금액 = 정산금액 × 세율 / 지급액 = 정산금액 − 세금액
import { describe, expect, it } from "vitest";

import {
  type EngineInput,
  type EngineRule,
  type SourceSale,
  allocateDiscount,
  computeSettlement,
  ratioLabelOf,
  scaleRefund,
  settledKey,
  sourceKey,
  totalsOf,
} from "./settlement-engine";

const KIM = "11111111-1111-1111-1111-111111111111";
const LEE = "22222222-2222-2222-2222-222222222222";
const PLAN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLAN_PAIR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const FROM = "2026-07-31T15:00:00.000Z"; // KST 2026-08-01
const TO = "2026-08-31T15:00:00.000Z"; // KST 2026-09-01
const IN_MONTH = "2026-08-10T01:00:00.000Z";
const PREV_MONTH = "2026-07-10T01:00:00.000Z";

function rule(over: Partial<EngineRule> = {}): EngineRule {
  return {
    rule_id: "rule-1",
    instructor_id: KIM,
    target_kind: "all",
    target_plan_id: null,
    target_subject_code: null,
    share_kind: "percent",
    share_value: 30,
    effective_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function sale(over: Partial<SourceSale> = {}): SourceSale {
  return {
    sourceKind: "payment",
    sourceId: "pay-1",
    planId: PLAN_A,
    subjectCode: null,
    grossKrw: 100_000,
    paidAt: IN_MONTH,
    refundedAt: null,
    refundKrw: 0,
    label: "특허법 심화",
    studentName: "홍길동",
    ...over,
  };
}

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    sales: [],
    refunds: [],
    rules: [rule()],
    planSubjects: new Map(),
    planInstructors: new Map(),
    settled: new Set(),
    sharedBy: new Map(),
    fromIso: FROM,
    toIso: TO,
    feeRateBp: 0,
    ...over,
  };
}

describe("정산 산식", () => {
  it("수수료율 0이면 매출 = 결제, 정산금액 = 결제 × 비율", () => {
    const { byInstructor } = computeSettlement(input({ sales: [sale()] }));
    const items = byInstructor.get(KIM)!;
    expect(items).toHaveLength(1);
    expect(items[0].baseAmountKrw).toBe(100_000);
    expect(items[0].feeKrw).toBe(0);
    expect(items[0].settleBaseKrw).toBe(100_000);
    expect(items[0].shareAmountKrw).toBe(30_000);
  });

  it("수수료를 뺀 매출에 정산비율을 곱한다 (3.3%, 30%)", () => {
    const { byInstructor } = computeSettlement(
      input({ sales: [sale()], feeRateBp: 330 }),
    );
    const items = byInstructor.get(KIM)!;
    expect(items[0].feeKrw).toBe(3_300); // 100,000 × 3.3%
    expect(items[0].settleBaseKrw).toBe(96_700); // 100,000 − 3,300
    expect(items[0].shareAmountKrw).toBe(29_010); // 96,700 × 30%
  });

  it("세금·지급액 — 개인 원천징수 3.3%", () => {
    const { byInstructor } = computeSettlement(
      input({ sales: [sale()], feeRateBp: 330 }),
    );
    const t = totalsOf(byInstructor.get(KIM)!, 330, {
      taxType: "withholding",
      taxRateBp: 330,
    });
    expect(t.grossKrw).toBe(100_000);
    expect(t.refundKrw).toBe(0);
    expect(t.feeKrw).toBe(3_300);
    expect(t.netSalesKrw).toBe(96_700);
    expect(t.shareKrw).toBe(29_010);
    expect(t.taxKrw).toBe(957); // 29,010 × 3.3% = 957.33 → 957
    expect(t.payoutKrw).toBe(28_053);
  });

  it("사업자(세금계산서)는 세금액 0 — 지급액 = 정산금액", () => {
    const { byInstructor } = computeSettlement(input({ sales: [sale()] }));
    const t = totalsOf(byInstructor.get(KIM)!, 0, {
      taxType: "invoice",
      taxRateBp: 0,
    });
    expect(t.taxKrw).toBe(0);
    expect(t.payoutKrw).toBe(t.shareKrw);
  });
});

describe("환불", () => {
  it("당월 결제·당월 환불은 배분 + 환불차감 두 줄로 남고 합계가 0", () => {
    const refunded = sale({
      refundedAt: "2026-08-20T01:00:00.000Z",
      refundKrw: 100_000,
    });
    const { byInstructor } = computeSettlement(
      input({ sales: [refunded], refunds: [refunded], feeRateBp: 330 }),
    );
    const items = byInstructor.get(KIM)!;
    expect(items.map((i) => i.kind)).toEqual(["share", "refund_adjustment"]);
    const t = totalsOf(items, 330, { taxType: "withholding", taxRateBp: 330 });
    expect(t.grossKrw).toBe(100_000);
    expect(t.refundKrw).toBe(100_000);
    expect(t.netSalesKrw).toBe(0);
    expect(t.shareKrw).toBe(0);
    expect(t.payoutKrw).toBe(0);
  });

  it("지난달 결제의 이번달 환불 — 원 배분이 확정 정산에 있을 때만 차감", () => {
    const old = sale({
      sourceId: "pay-old",
      paidAt: PREV_MONTH,
      refundedAt: "2026-08-05T01:00:00.000Z",
      refundKrw: 100_000,
    });
    const without = computeSettlement(input({ refunds: [old] }));
    expect(without.byInstructor.get(KIM)).toBeUndefined();

    const withShare = computeSettlement(
      input({
        refunds: [old],
        sharedBy: new Map([[sourceKey("payment", "pay-old"), new Set([KIM])]]),
      }),
    );
    const items = withShare.byInstructor.get(KIM)!;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("refund_adjustment");
    expect(items[0].shareAmountKrw).toBe(-30_000);
    expect(items[0].note).toBe("확정 정산분 환불 차감");
  });
});

describe("이중 계상 방지", () => {
  it("이미 다른 정산에 잡힌 원천은 건너뛴다", () => {
    const { byInstructor } = computeSettlement(
      input({
        sales: [sale()],
        settled: new Set([settledKey(KIM, "payment", "pay-1", "share")]),
      }),
    );
    expect(byInstructor.get(KIM)).toBeUndefined();
  });

  it("원천 종류가 다르면 같은 id 라도 별개다", () => {
    const { byInstructor } = computeSettlement(
      input({
        sales: [sale({ sourceKind: "order_item", sourceId: "pay-1" })],
        settled: new Set([settledKey(KIM, "payment", "pay-1", "share")]),
      }),
    );
    expect(byInstructor.get(KIM)).toHaveLength(1);
  });
});

describe("규칙 선택", () => {
  it("상품 규칙이 과목·전체 규칙을 이긴다", () => {
    const { byInstructor } = computeSettlement(
      input({
        sales: [sale({ subjectCode: "patent" })],
        rules: [
          rule({ rule_id: "all", share_value: 10 }),
          rule({
            rule_id: "subject",
            target_kind: "subject",
            target_subject_code: "patent",
            share_value: 20,
          }),
          rule({
            rule_id: "plan",
            target_kind: "plan",
            target_plan_id: PLAN_A,
            share_value: 50,
          }),
        ],
      }),
    );
    expect(byInstructor.get(KIM)![0].shareAmountKrw).toBe(50_000);
  });

  it("적용 시작일이 결제일보다 뒤면 쓰이지 않는다", () => {
    const { byInstructor } = computeSettlement(
      input({
        sales: [sale()],
        rules: [rule({ effective_from: "2026-09-01" })],
      }),
    );
    expect(byInstructor.get(KIM)).toBeUndefined();
  });
});

describe("강의 담당 강사 안분", () => {
  it("두 강사가 묶인 상품은 강의 수 비율로 나눈다", () => {
    const { byInstructor, missingRule } = computeSettlement(
      input({
        sales: [sale({ planId: PLAN_PAIR })],
        rules: [
          rule({ instructor_id: KIM, share_value: 50 }),
          rule({ rule_id: "rule-2", instructor_id: LEE, share_value: 40 }),
        ],
        planInstructors: new Map([
          [
            PLAN_PAIR,
            new Map([
              [KIM, 0.5],
              [LEE, 0.5],
            ]),
          ],
        ]),
      }),
    );
    expect(missingRule).toHaveLength(0);
    expect(byInstructor.get(KIM)![0].baseAmountKrw).toBe(50_000);
    expect(byInstructor.get(KIM)![0].shareAmountKrw).toBe(25_000); // 50,000 × 50%
    expect(byInstructor.get(LEE)![0].shareAmountKrw).toBe(20_000); // 50,000 × 40%
  });

  it("담당 강의는 있는데 배분 규칙이 없으면 정산하지 않고 보고한다", () => {
    const { byInstructor, missingRule } = computeSettlement(
      input({
        sales: [sale({ planId: PLAN_PAIR })],
        rules: [rule({ instructor_id: KIM })],
        planInstructors: new Map([
          [
            PLAN_PAIR,
            new Map([
              [KIM, 0.5],
              [LEE, 0.5],
            ]),
          ],
        ]),
      }),
    );
    expect(byInstructor.get(LEE)).toBeUndefined();
    expect(missingRule).toEqual([
      {
        instructorId: LEE,
        sourceKind: "payment",
        sourceId: "pay-1",
        label: "특허법 심화",
      },
    ]);
  });

  it("강의가 묶이지 않은 상품은 규칙에 맞는 모든 강사에게 전액 기준", () => {
    const { byInstructor } = computeSettlement(
      input({
        sales: [sale()],
        rules: [
          rule({ instructor_id: KIM, share_value: 30 }),
          rule({ rule_id: "rule-2", instructor_id: LEE, share_value: 20 }),
        ],
      }),
    );
    expect(byInstructor.get(KIM)![0].baseAmountKrw).toBe(100_000);
    expect(byInstructor.get(LEE)![0].baseAmountKrw).toBe(100_000);
  });
});

describe("주문 쿠폰할인 안분", () => {
  const rows = [
    { id: "a", gross: 30_000 },
    { id: "b", gross: 45_000 },
    { id: "c", gross: 25_000 },
  ];

  it("나누어떨어지지 않아도 합이 정확히 (정가합 − 할인)", () => {
    const net = allocateDiscount(rows, 10_000);
    const sum = [...net.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(100_000 - 10_000);
    expect(net.get("a")).toBe(27_000); // 30,000 − round(10,000×0.30)
    expect(net.get("b")).toBe(40_500);
    expect(net.get("c")).toBe(22_500);
  });

  it("반올림 잔액은 마지막 항목이 흡수한다", () => {
    const odd = [
      { id: "a", gross: 10_000 },
      { id: "b", gross: 10_000 },
      { id: "c", gross: 10_000 },
    ];
    const net = allocateDiscount(odd, 1_000);
    expect([...net.values()].reduce((a, b) => a + b, 0)).toBe(29_000);
    expect(net.get("a")).toBe(9_667); // round(1000/3)=333
    expect(net.get("b")).toBe(9_667);
    expect(net.get("c")).toBe(9_666); // 잔액 흡수
  });

  it("할인 0·음수·정가합 초과를 안전하게 다룬다", () => {
    expect([...allocateDiscount(rows, 0).values()]).toEqual([
      30_000, 45_000, 25_000,
    ]);
    expect([...allocateDiscount(rows, -500).values()]).toEqual([
      30_000, 45_000, 25_000,
    ]);
    const all = allocateDiscount(rows, 999_999);
    expect([...all.values()].reduce((a, b) => a + b, 0)).toBe(0);
    expect([...all.values()].every((v) => v >= 0)).toBe(true);
  });

  it("할인된 항목의 전액 환불은 할인 후 금액과 정확히 같다", () => {
    const net = allocateDiscount(rows, 10_000);
    // order_items.refund_amount_krw 는 할인 전 금액(45,000)으로 기록된다.
    expect(scaleRefund(45_000, net.get("b")!, 45_000)).toBe(40_500);
    expect(scaleRefund(0, net.get("b")!, 45_000)).toBe(0);
  });

  it("★환불액을 할인 후 금액으로 기록하면 두 번 깎인다 — 기록 평면이 정가여야 하는 이유", () => {
    const netB = allocateDiscount(rows, 10_000).get("b")!; // 40,500
    // 잘못된 기록(할인 후 40,500) → 40,500 × 40,500/45,000 = 36,450.
    // 환불이 결제액(40,500)을 4,050 만큼 못 상쇄하고, 그 차액이 강사에게 과다 지급된다.
    expect(scaleRefund(netB, netB, 45_000)).toBe(36_450);
    expect(scaleRefund(netB, netB, 45_000)).toBeLessThan(netB);
  });

  // ★commit_refund 가 order_items.refund_amount_krw 에 쓰는 계산을 그대로 옮긴 것
  //   (scripts/sql/20260915_p7h3_refund_gross_plane.sql): round(실환불액 × 정가 ÷ 결제귀속액).
  //   분모(결제귀속액)와 정산의 netKrw 는 같은 값의 두 계산이며, 아래 왕복이 그것을 못 박는다.
  function toGrossPlane(actualRefundKrw: number, grossKrw: number, paidKrw: number): number {
    if (paidKrw <= 0) return 0;
    return Math.round((actualRefundKrw * grossKrw) / paidKrw);
  }

  it("★부분 금액 환불은 정가 평면으로 환산해야 정산이 실환불액을 본다", () => {
    const netB = allocateDiscount(rows, 10_000).get("b")!; // 40,500 (정가 45,000)
    const actual = 20_000; // 공제 후 실제로 돌려준 돈

    // 고친 뒤 — 환산해 기록하면 정산이 실환불액 그대로 본다.
    expect(scaleRefund(toGrossPlane(actual, 45_000, netB), netB, 45_000)).toBe(actual);

    // 고치기 전 — 정가 전액을 기록하면 정산은 **전액 환불**로 읽어 강사에게서 더 뗀다.
    expect(scaleRefund(45_000, netB, 45_000)).toBe(netB);
    expect(scaleRefund(45_000, netB, 45_000)).toBeGreaterThan(actual);
  });

  it("환산은 0원 환불·할인 없는 항목에서도 어긋나지 않는다", () => {
    expect(toGrossPlane(0, 45_000, 40_500)).toBe(0);
    // 할인 없음(정가 = 결제액) → 환산이 항등식이 된다. 스냅샷 없는 옛 주문의 폴백 경로.
    expect(toGrossPlane(8_000, 10_000, 10_000)).toBe(8_000);
    expect(scaleRefund(toGrossPlane(8_000, 10_000, 10_000), 10_000, 10_000)).toBe(8_000);
  });

  it("할인된 항목의 전액 환불이 결제액을 정확히 상쇄한다", () => {
    const netB = allocateDiscount(rows, 10_000).get("b")!;
    const discounted = sale({
      sourceKind: "order_item",
      sourceId: "item-b",
      grossKrw: netB,
      refundedAt: "2026-08-20T01:00:00.000Z",
      refundKrw: scaleRefund(45_000, netB, 45_000),
    });
    const { byInstructor } = computeSettlement(
      input({ sales: [discounted], refunds: [discounted], feeRateBp: 330 }),
    );
    const t = totalsOf(byInstructor.get(KIM)!, 330, {
      taxType: "withholding",
      taxRateBp: 330,
    });
    expect(t.grossKrw).toBe(40_500);
    expect(t.refundKrw).toBe(40_500);
    expect(t.netSalesKrw).toBe(0);
    expect(t.payoutKrw).toBe(0);
  });
});

describe("정산비율 표기", () => {
  it("같은 정률이면 퍼센트, 섞이면 규칙별", () => {
    const one = [
      { kind: "share" as const, shareKind: "percent" as const, shareValue: 30 },
    ];
    expect(ratioLabelOf(one)).toBe("30%");
    expect(
      ratioLabelOf([
        ...one,
        {
          kind: "share" as const,
          shareKind: "percent" as const,
          shareValue: 40,
        },
      ]),
    ).toBe("규칙별");
    expect(ratioLabelOf([])).toBe("—");
  });
});

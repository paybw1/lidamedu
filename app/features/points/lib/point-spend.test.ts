// 포인트 결제 규칙 테스트 (feat-11-013 D15).
//
// ★못박는 것은 **상한**이다. 이 식이 견적과 결제에서 다르게 계산되면
//   「화면엔 되는데 결제는 거절」이 나고, 상한이 느슨하면 0원 주문이 토스로 나가 실패한다.

import { describe, expect, it } from "vitest";

import {
  MIN_BALANCE_TO_USE,
  MIN_PG_CHARGE_KRW,
  POINT_UNIT,
  checkPointUse,
  maxUsablePoints,
} from "./point-spend";

describe("maxUsablePoints — 쓸 수 있는 최대치", () => {
  it("보유가 최소 기준 미만이면 0", () => {
    expect(maxUsablePoints({ balance: 999, payableKrw: 100_000 })).toBe(0);
    expect(maxUsablePoints({ balance: MIN_BALANCE_TO_USE, payableKrw: 100_000 })).toBe(1_000);
  });

  it("★결제액에서 최소 결제분을 남긴다 — 전액 포인트 결제가 되지 않는다", () => {
    // 5,000원짜리에 5,000P 보유 → 4,000P 까지만
    expect(maxUsablePoints({ balance: 5_000, payableKrw: 5_000 })).toBe(4_000);
  });

  it("★남는 금액이 항상 최소 결제액 이상이다 — 어떤 조합에서도", () => {
    for (const payable of [1_000, 1_050, 1_100, 2_500, 9_900, 300_000]) {
      for (const balance of [1_000, 3_333, 50_000, 999_999]) {
        const use = maxUsablePoints({ balance, payableKrw: payable });
        expect(payable - use).toBeGreaterThanOrEqual(MIN_PG_CHARGE_KRW);
      }
    }
  });

  it("결제액이 최소 결제액 + 1단위 미만이면 쓸 수 없다", () => {
    expect(maxUsablePoints({ balance: 50_000, payableKrw: MIN_PG_CHARGE_KRW })).toBe(0);
    expect(maxUsablePoints({ balance: 50_000, payableKrw: 1_099 })).toBe(0);
    expect(maxUsablePoints({ balance: 50_000, payableKrw: 1_100 })).toBe(100);
  });

  it("항상 사용 단위로 내림한다 — 올림하면 상한을 넘는다", () => {
    const r = maxUsablePoints({ balance: 3_350, payableKrw: 100_000 });
    expect(r % POINT_UNIT).toBe(0);
    expect(r).toBe(3_300);
  });

  it("보유가 결제액보다 많아도 결제액 쪽 상한이 이긴다", () => {
    expect(maxUsablePoints({ balance: 1_000_000, payableKrw: 9_900 })).toBe(8_900);
  });
});

describe("checkPointUse — 입력 검증", () => {
  const base = { balance: 50_000, payableKrw: 100_000 };

  it("0원은 언제나 통과 — 포인트를 안 쓰는 주문", () => {
    expect(checkPointUse({ ...base, requestedKrw: 0 })).toEqual({ ok: true, amountKrw: 0 });
    // 보유가 없어도 0 은 통과해야 한다(포인트 없는 학생도 결제해야 한다)
    expect(checkPointUse({ balance: 0, payableKrw: 100_000, requestedKrw: 0 })).toEqual({
      ok: true,
      amountKrw: 0,
    });
  });

  it("정상 사용", () => {
    expect(checkPointUse({ ...base, requestedKrw: 10_000 })).toEqual({
      ok: true,
      amountKrw: 10_000,
    });
  });

  it("단위가 안 맞으면 거절 — ★조용히 깎지 않는다", () => {
    const r = checkPointUse({ ...base, requestedKrw: 1_050 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("100P 단위");
  });

  it("보유를 넘으면 거절", () => {
    const r = checkPointUse({ balance: 5_000, payableKrw: 100_000, requestedKrw: 10_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("부족");
  });

  it("최소 보유 미만이면 거절 — 이유가 「부족」이 아니라 「모았을 때부터」여야 한다", () => {
    const r = checkPointUse({ balance: 900, payableKrw: 100_000, requestedKrw: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("이상 모았을 때");
      expect(r.maxKrw).toBe(0);
    }
  });

  it("★상한을 넘으면 거절하고 최대치를 알려준다", () => {
    const r = checkPointUse({ balance: 50_000, payableKrw: 9_900, requestedKrw: 9_900 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.maxKrw).toBe(8_900);
      expect(r.error).toContain("8,900P");
    }
  });

  it("결제액이 너무 작아 쓸 수 없는 주문은 그렇게 말한다", () => {
    const r = checkPointUse({ balance: 50_000, payableKrw: 1_000, requestedKrw: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("보다 커야");
  });

  it("음수·NaN 은 거절", () => {
    expect(checkPointUse({ ...base, requestedKrw: -100 }).ok).toBe(false);
    expect(checkPointUse({ ...base, requestedKrw: Number.NaN }).ok).toBe(false);
  });

  it("★통과한 값은 언제나 상한 이하다 — 이 불변식이 0원 주문을 막는다", () => {
    for (const payable of [1_100, 5_000, 9_900, 300_000]) {
      for (const req of [100, 1_000, 8_900, 50_000]) {
        const r = checkPointUse({ balance: 100_000, payableKrw: payable, requestedKrw: req });
        if (r.ok) expect(payable - r.amountKrw).toBeGreaterThanOrEqual(MIN_PG_CHARGE_KRW);
      }
    }
  });
});

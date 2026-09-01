// feat-11-010 — 연장 정책·날짜 계산 회귀.
// ★날짜 계산이 이 기능에서 가장 틀리기 쉬운 부분이다(KST·당일 미포함·30일 마감).
import { describe, expect, it } from "vitest";

import {
  EXTENSION_DEFAULTS_FALLBACK,
  computeNextExpiry,
  resolveExtensionOffer,
  resolveExtensionPolicy,
  startOfNextKstDay,
  type PlanExtensionInput,
} from "./extension-policy";

const defaults = {
  enabled: true,
  priceKrw: 30000,
  maxCount: 3,
  days: 30,
};

const plan: PlanExtensionInput = {
  productKind: "course",
  extensionAllowed: null,
  extensionPriceKrw: null,
  extensionMaxCount: null,
  extensionDays: null,
  durationDays: 180,
};

describe("resolveExtensionPolicy — 기본값 + 강의별 override", () => {
  it("전부 NULL 이면 기본값을 그대로 쓴다", () => {
    expect(resolveExtensionPolicy(plan, defaults)).toEqual({
      enabled: true,
      priceKrw: 30000,
      maxCount: 3,
      days: 30,
    });
  });

  it("강의별 값이 있으면 기본값을 이긴다", () => {
    const r = resolveExtensionPolicy(
      { ...plan, extensionPriceKrw: 10000, extensionMaxCount: 0, extensionAllowed: false },
      defaults,
    );
    expect(r).toEqual({ enabled: false, priceKrw: 10000, maxCount: 0, days: 30 });
  });

  it("연장일수 0 = 강의 기본 학습일수", () => {
    expect(resolveExtensionPolicy({ ...plan, extensionDays: 0 }, defaults).days).toBe(
      180,
    );
  });

  it("기본값이 없으면 꺼진 상태가 안전한 기본", () => {
    expect(
      resolveExtensionPolicy(plan, EXTENSION_DEFAULTS_FALLBACK).enabled,
    ).toBe(false);
  });
});

describe("종료일 계산 (KST)", () => {
  it("수강 중이면 종료일 뒤에 누적한다", () => {
    // 2026-09-01 12:00 KST 에 결제, 종료일은 2026-10-01 → 10-31 이 된다.
    const now = new Date("2026-09-01T03:00:00Z");
    const next = computeNextExpiry(now, new Date("2026-10-01T00:00:00Z"), 30);
    expect(next.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("종료 후면 결제 당일은 빼고 내일 0시(KST)부터 센다", () => {
    // 요청서 예시 — 종료된 강의를 오늘 5일 연장 → 오늘 즉시 수강 → 내일부터 5일.
    // 2026-09-01 23:00 KST = 14:00Z. 내일 0시 KST = 2026-09-01T15:00Z.
    const now = new Date("2026-09-01T14:00:00Z");
    const next = computeNextExpiry(now, new Date("2026-08-01T00:00:00Z"), 5);
    expect(next.toISOString()).toBe("2026-09-06T15:00:00.000Z");
  });

  it("startOfNextKstDay — KST 자정 직전·직후가 같은 날로 뭉개지지 않는다", () => {
    // 2026-09-01 23:59 KST → 내일(9/2) 0시 KST
    expect(startOfNextKstDay(new Date("2026-09-01T14:59:00Z")).toISOString()).toBe(
      "2026-09-01T15:00:00.000Z",
    );
    // 2026-09-02 00:01 KST → 내일(9/3) 0시 KST
    expect(startOfNextKstDay(new Date("2026-09-01T15:01:00Z")).toISOString()).toBe(
      "2026-09-02T15:00:00.000Z",
    );
  });
});

describe("resolveExtensionOffer — 버튼 활성화 기준", () => {
  const now = new Date("2026-09-01T03:00:00Z");
  const call = (over: Partial<Parameters<typeof resolveExtensionOffer>[0]>) =>
    resolveExtensionOffer({
      now,
      plan,
      defaults,
      status: "active",
      expiresAt: "2026-10-01T00:00:00Z",
      usedCount: 0,
      ...over,
    });

  it("수강 중 + 횟수 여유 → 허용", () => {
    const r = call({});
    expect(r.ok).toBe(true);
    expect(r.remainingCount).toBe(3);
  });

  it("종료 후 30일 이내 → 허용", () => {
    expect(call({ expiresAt: "2026-08-20T00:00:00Z" }).ok).toBe(true);
  });

  it("종료 후 30일 초과 → 거절", () => {
    const r = call({ expiresAt: "2026-07-01T00:00:00Z" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("grace_expired");
  });

  it("최대 횟수를 다 쓰면 거절", () => {
    expect(call({ usedCount: 3 }).reason).toBe("max_count");
  });

  it("최대 횟수 0 = 무제한", () => {
    const r = call({
      plan: { ...plan, extensionMaxCount: 0 },
      usedCount: 99,
    });
    expect(r.ok).toBe(true);
    expect(r.remainingCount).toBeNull();
  });

  it("패키지·현장강의는 대상이 아니다", () => {
    expect(call({ plan: { ...plan, productKind: "tpass" } }).reason).toBe(
      "not_course",
    );
  });

  it("해지된 수강권은 연장 불가", () => {
    expect(call({ status: "revoked" }).reason).toBe("revoked");
  });

  it("금액이 0이면 결제할 게 없으므로 거절", () => {
    expect(call({ plan: { ...plan, extensionPriceKrw: 0 } }).reason).toBe(
      "no_price",
    );
  });
});

// feat-2-027 Phase 2 — 전체 레벨 순수 계산 검산.
import { describe, expect, it } from "vitest";

import { computeLevel } from "./level";

describe("computeLevel", () => {
  it("마스터 0 = 입문(Lv.1), 다음=정진까지 3", () => {
    const l = computeLevel(0);
    expect(l.name).toBe("입문");
    expect(l.levelNumber).toBe(1);
    expect(l.nextName).toBe("정진");
    expect(l.toNext).toBe(3);
  });

  it("임계 미만은 단계 유지(2 → 입문, 1 남음)", () => {
    const l = computeLevel(2);
    expect(l.name).toBe("입문");
    expect(l.toNext).toBe(1);
  });

  it("정진(3) / 숙련(8) / 정통(15) 경계", () => {
    expect(computeLevel(3).name).toBe("정진");
    expect(computeLevel(3).levelNumber).toBe(2);
    expect(computeLevel(7).name).toBe("정진");
    expect(computeLevel(8).name).toBe("숙련");
    expect(computeLevel(15).name).toBe("정통");
  });

  it("통달(25) = 최고 단계, 다음 없음", () => {
    const l = computeLevel(25);
    expect(l.name).toBe("통달");
    expect(l.levelNumber).toBe(5);
    expect(l.nextName).toBeNull();
    expect(l.toNext).toBeNull();
  });

  it("음수 clamp → 입문", () => {
    expect(computeLevel(-5).name).toBe("입문");
    expect(computeLevel(-5).masteredCount).toBe(0);
  });
});

// feat-2-027 Phase 2 — 스트릭 순수 계산 검산. 주간 케이던스 + freeze 보호 + 관대한 시작.
import { describe, expect, it } from "vitest";

import {
  type DayActivity,
  computeProtectedStreak,
  mondayOf,
  thisWeekActiveDays,
} from "./streak";

// attemptCount 패턴(오래된→최신)으로 DayActivity[] 생성. 날짜는 순서만 의미.
function mk(pattern: number[]): DayActivity[] {
  return pattern.map((c, i) => ({
    date: `2024-02-${String(i + 1).padStart(2, "0")}`,
    attemptCount: c,
  }));
}

describe("mondayOf", () => {
  it("월요일은 자기 자신", () => {
    expect(mondayOf("2024-01-01")).toBe("2024-01-01"); // 2024-01-01 = 월
    expect(mondayOf("2024-01-08")).toBe("2024-01-08");
  });
  it("일요일 → 그 주 월요일", () => {
    expect(mondayOf("2024-01-07")).toBe("2024-01-01"); // 일 → 월
  });
});

describe("thisWeekActiveDays", () => {
  it("이번 주(월~오늘) 활동일만 카운트, 지난 주 제외", () => {
    const days: DayActivity[] = [
      { date: "2024-01-07", attemptCount: 9 }, // 지난 주 일요일(제외)
      { date: "2024-01-08", attemptCount: 3 }, // 월(이번 주)
      { date: "2024-01-09", attemptCount: 0 }, // 화(0)
      { date: "2024-01-10", attemptCount: 1 }, // 수(오늘)
    ];
    expect(thisWeekActiveDays(days, "2024-01-10")).toBe(2);
  });
});

describe("computeProtectedStreak", () => {
  it("연속 전부 활동 = 길이", () => {
    expect(computeProtectedStreak(mk([1, 1, 1, 1, 1]), 0)).toBe(5);
  });

  it("중간 빈 날: freeze 0 이면 끊김, freeze 1 이면 이어짐", () => {
    expect(computeProtectedStreak(mk([1, 1, 1, 0, 1]), 0)).toBe(1);
    expect(computeProtectedStreak(mk([1, 1, 1, 0, 1]), 1)).toBe(4);
  });

  it("오늘 미완(맨 끝 0)은 무료로 건너뛰고 어제부터", () => {
    expect(computeProtectedStreak(mk([1, 1, 0]), 0)).toBe(2);
  });

  it("오늘+어제 모두 0 = 연속 0", () => {
    expect(computeProtectedStreak(mk([1, 0, 0]), 0)).toBe(0);
  });

  it("빈 배열 = 0", () => {
    expect(computeProtectedStreak([], 1)).toBe(0);
  });
});

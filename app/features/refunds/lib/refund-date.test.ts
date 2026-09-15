import { describe, expect, it } from "vitest";

import { isCalendarDate } from "./refund-date";

describe("isCalendarDate", () => {
  it("정상 날짜", () => {
    expect(isCalendarDate("2026-09-15")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true); // 윤년
  });

  it("★백슬래시가 빠진 정규식이었다면 여기서 false 가 된다 — 2026-09-15 실제 사고", () => {
    expect(isCalendarDate("dddd-dd-dd")).toBe(false);
    expect(isCalendarDate("2026-09-15")).toBe(true);
  });

  it("★달력에 없는 날은 막는다 — JS 는 조용히 굴려 버린다", () => {
    expect(isCalendarDate("2026-02-31")).toBe(false); // → 3월 3일로 굴러감
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2025-02-29")).toBe(false); // 평년
  });

  it("형식이 어긋나면 막는다", () => {
    expect(isCalendarDate("2026-9-5")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
    expect(isCalendarDate("2026-09-15T00:00:00Z")).toBe(false);
  });
});

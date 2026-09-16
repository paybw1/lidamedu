import { describe, expect, it } from "vitest";

import {
  computeTermWindow,
  isMidEntryClosed,
  kstDayEndMs,
  kstDayStartMs,
} from "./term-window";

const DAY = 86_400_000;
const START = "2026-10-01";
const END = "2026-12-31";
const startMs = kstDayStartMs(START);
const endMs = kstDayEndMs(END);

describe("term-window (feat-11-013 P3-b)", () => {
  it("KST 경계 — 시작일 00:00+09:00 · 종료일 23:59:59+09:00", () => {
    expect(new Date(startMs).toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-12-31T14:59:59.000Z");
    expect(endMs).toBe(Date.parse(`${END}T23:59:59+09:00`)); // 현행 computeExpiry 와 같은 값
  });

  it("시작 전 결제 → 시작일부터 종료일까지, 중간 신청 아님", () => {
    const w = computeTermWindow({
      nowMs: startMs - 10 * DAY,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "fixed_days",
      midEntryDays: 30,
    });
    expect(w).toEqual({
      startsAtMs: startMs,
      endsAtMs: endMs,
      isMidEntry: false,
      endsBasis: "fixed_end",
    });
  });

  it("시작 후 결제 · until_end → 지금부터 종료일까지", () => {
    const now = startMs + 5 * DAY;
    const w = computeTermWindow({
      nowMs: now,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "until_end",
      midEntryDays: null,
    });
    expect(w).toEqual({ startsAtMs: now, endsAtMs: endMs, isMidEntry: true, endsBasis: "fixed_end" });
  });

  it("시작 후 결제 · fixed_days → 지금 + N일, 종료일을 넘어도 상한 없음", () => {
    const now = startMs + 80 * DAY; // 12-20 근처 — +30일이면 종료일(12-31)을 넘는다
    const w = computeTermWindow({
      nowMs: now,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "fixed_days",
      midEntryDays: 30,
    });
    expect(w.startsAtMs).toBe(now);
    expect(w.endsAtMs).toBe(now + 30 * DAY);
    expect(w.endsAtMs).toBeGreaterThan(endMs);
    expect(w.isMidEntry).toBe(true);
    expect(w.endsBasis).toBe("mid_entry_days");
  });

  it("closed 는 폴백 — 결제가 여기까지 오면 종료일까지(거절은 assertPlanSellable 몫)", () => {
    const now = startMs + DAY;
    const w = computeTermWindow({
      nowMs: now,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "closed",
      midEntryDays: null,
    });
    expect(w).toEqual({ startsAtMs: now, endsAtMs: endMs, isMidEntry: true, endsBasis: "fixed_end" });
  });

  it("시작일 없음 → 지금부터 종료일까지, 중간 신청 아님(현행 동작)", () => {
    const now = startMs + DAY;
    const w = computeTermWindow({
      nowMs: now,
      startsOn: null,
      fixedEndDate: END,
      midEntryMode: null,
      midEntryDays: null,
    });
    expect(w).toEqual({ startsAtMs: now, endsAtMs: endMs, isMidEntry: false, endsBasis: "fixed_end" });
  });

  it("시작일 없음 + fixed_days → 일수 규칙은 그대로 적용된다(설계: 그 밖의 경우 전부)", () => {
    const now = startMs + DAY;
    const w = computeTermWindow({
      nowMs: now,
      startsOn: null,
      fixedEndDate: END,
      midEntryMode: "fixed_days",
      midEntryDays: 10,
    });
    expect(w.endsAtMs).toBe(now + 10 * DAY);
    expect(w.isMidEntry).toBe(false);
    expect(w.endsBasis).toBe("mid_entry_days");
  });

  it("경계 — 시작일 당일 00:00:00 KST 결제는 중간 신청(시작 전은 1ms 전까지)", () => {
    const at = computeTermWindow({
      nowMs: startMs,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "until_end",
      midEntryDays: null,
    });
    expect(at.isMidEntry).toBe(true);
    expect(at.startsAtMs).toBe(startMs);
    const before = computeTermWindow({
      nowMs: startMs - 1,
      startsOn: START,
      fixedEndDate: END,
      midEntryMode: "until_end",
      midEntryDays: null,
    });
    expect(before.isMidEntry).toBe(false);
    expect(before.startsAtMs).toBe(startMs);
  });

  it("시작일 = 종료일 전날 → 하루짜리 창도 시작 < 종료", () => {
    const w = computeTermWindow({
      nowMs: kstDayStartMs("2026-12-01"),
      startsOn: "2026-12-30",
      fixedEndDate: END,
      midEntryMode: null,
      midEntryDays: null,
    });
    expect(w.startsAtMs).toBe(kstDayStartMs("2026-12-30"));
    expect(w.endsAtMs).toBe(endMs);
    expect(w.endsAtMs - w.startsAtMs).toBe(2 * DAY - 1000);
  });

  it("fixed_days 인데 일수가 없거나 0 이면 종료일 폴백(DB CHECK 가 막지만 방어)", () => {
    const now = startMs + DAY;
    for (const days of [null, 0, -3]) {
      const w = computeTermWindow({
        nowMs: now,
        startsOn: START,
        fixedEndDate: END,
        midEntryMode: "fixed_days",
        midEntryDays: days,
      });
      expect(w.endsAtMs).toBe(endMs);
      expect(w.endsBasis).toBe("fixed_end");
    }
  });

  it("isMidEntryClosed — closed 이고 시작일 00:00 KST 이후일 때만", () => {
    expect(isMidEntryClosed({ nowMs: startMs, startsOn: START, midEntryMode: "closed" })).toBe(true);
    expect(isMidEntryClosed({ nowMs: startMs - 1, startsOn: START, midEntryMode: "closed" })).toBe(false);
    expect(isMidEntryClosed({ nowMs: startMs + DAY, startsOn: null, midEntryMode: "closed" })).toBe(false);
    expect(isMidEntryClosed({ nowMs: startMs + DAY, startsOn: START, midEntryMode: "until_end" })).toBe(false);
  });
});

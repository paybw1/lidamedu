// 한국시간 판정 테스트 (feat-11-012 P5-c).
//
// ★고치기 전 증상: 쿠폰함은 세계표준시 날짜로, 결제 검증은 한국 날짜로 유효기간을 봤다.
//   매일 KST 00:00~09:00 아홉 시간 동안 **어제 만료된 쿠폰이 쿠폰함에는 「사용 가능」**으로
//   남아 있다가 결제에서 거절됐다. 그 창을 테스트로 못박는다.

import { describe, expect, it } from "vitest";

import {
  isBeforeKstDay,
  isExpiredInstant,
  kstDateOf,
  kstToday,
} from "./kst";

// UTC 2026-09-14 00:30 = KST 2026-09-14 09:30
const UTC_MORNING = Date.parse("2026-09-14T00:30:00.000Z");
// UTC 2026-09-13 23:30 = KST 2026-09-14 08:30  ← 문제의 아홉 시간 창
const UTC_LATE_NIGHT = Date.parse("2026-09-13T23:30:00.000Z");

describe("kstToday", () => {
  it("★UTC 로는 어제여도 한국은 이미 오늘이다 — 이 창에서 판정이 갈렸다", () => {
    expect(new Date(UTC_LATE_NIGHT).toISOString().slice(0, 10)).toBe(
      "2026-09-13",
    );
    expect(kstToday(UTC_LATE_NIGHT)).toBe("2026-09-14");
  });

  it("같은 날 낮에는 둘이 같다", () => {
    expect(kstToday(UTC_MORNING)).toBe("2026-09-14");
  });
});

describe("isBeforeKstDay — 쿠폰 유효기간(date 컬럼)", () => {
  it("★어제 만료된 쿠폰은 그 아홉 시간 창에서도 만료다", () => {
    const validTo = "2026-09-13";
    // 종전 판정(UTC 날짜)은 "2026-09-13 < 2026-09-13" = false → 사용 가능으로 보였다.
    expect(isBeforeKstDay(validTo, kstToday(UTC_LATE_NIGHT))).toBe(true);
  });

  it("오늘까지인 쿠폰은 오늘은 살아 있다", () => {
    expect(isBeforeKstDay("2026-09-14", kstToday(UTC_LATE_NIGHT))).toBe(false);
  });
});

describe("kstDateOf", () => {
  it("시각을 한국 달력일로 바꾼다", () => {
    expect(kstDateOf("2026-09-13T23:30:00.000Z")).toBe("2026-09-14");
  });

  it("값이 없거나 형식이 틀리면 null", () => {
    expect(kstDateOf(null)).toBeNull();
    expect(kstDateOf("")).toBeNull();
    expect(kstDateOf("어제")).toBeNull();
  });
});

describe("isExpiredInstant — timestamptz 비교", () => {
  it("지난 시각은 만료", () => {
    expect(isExpiredInstant("2026-09-13T00:00:00.000Z", UTC_MORNING)).toBe(true);
  });

  it("앞으로 올 시각은 만료 아님", () => {
    expect(isExpiredInstant("2026-09-30T00:00:00.000Z", UTC_MORNING)).toBe(
      false,
    );
  });

  it("만료 시각이 없으면 만료가 아니다", () => {
    expect(isExpiredInstant(null, UTC_MORNING)).toBe(false);
  });

  it("★오프셋 표기를 사전순으로 비교하면 틀린다 — 값으로 비교해야 한다", () => {
    // 한국시간 표기(+09:00)로 온 값. UTC 00:29 = 이미 지난 시각이다.
    const pastInKstNotation = "2026-09-14T09:29:00.000+09:00";
    const nowIso = new Date(UTC_MORNING).toISOString(); // "2026-09-14T00:30:00.000Z"
    // 사전순으로는 "T09…" > "T00…" 이라 **아직 안 지났다**고 나온다 — 틀린 판정.
    expect(pastInKstNotation > nowIso).toBe(true);
    // 시각 값으로 비교하면 만료가 맞다.
    expect(isExpiredInstant(pastInKstNotation, UTC_MORNING)).toBe(true);
  });
});

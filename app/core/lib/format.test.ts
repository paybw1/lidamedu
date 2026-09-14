// 표기 포매터 테스트 (feat-11-012 P6-c).
// ★못박는 것: 길이 0 은 「0분」이 아니라 **빈 문자열**이다 — 「길이 미확인」과 구분해야 한다.

import { describe, expect, it } from "vitest";

import { amount, clock, date, duration, percent, won } from "./format";

describe("won / amount", () => {
  it("천 단위 구분 + 원", () => {
    expect(won(29700)).toBe("29,700원");
    expect(won(0)).toBe("0원");
    expect(amount(92600)).toBe("92,600");
  });
  it("소수는 반올림한다(원 단위 아래는 없다)", () => {
    expect(won(1500.4)).toBe("1,500원");
    expect(won(1500.6)).toBe("1,501원");
  });
});

describe("duration — 사람이 읽는 길이", () => {
  it("★0 이하는 빈 문자열 — 「0분」으로 쓰면 길이 미확인과 구분이 안 된다", () => {
    expect(duration(0)).toBe("");
    expect(duration(-5)).toBe("");
  });
  it("1분 미만은 초", () => {
    expect(duration(45)).toBe("45초");
    expect(duration(59)).toBe("59초");
  });
  it("1시간 미만은 분(반올림)", () => {
    expect(duration(60)).toBe("1분");
    expect(duration(1200)).toBe("20분");
    expect(duration(3540)).toBe("59분");
  });
  it("1시간 이상은 시간+분, 정각이면 시간만", () => {
    // ★59분 30초는 반올림하면 60분 — 「60분」이 아니라 「1시간」으로 넘어간다.
    expect(duration(3570)).toBe("1시간");
    expect(duration(3600)).toBe("1시간");
    expect(duration(5400)).toBe("1시간 30분");
    expect(duration(7200)).toBe("2시간");
  });
});

describe("clock — 재생 위치", () => {
  it("한 시간 미만은 분:초", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(425)).toBe("7:05");
  });
  it("한 시간 넘으면 시:분:초 (분을 두 자리로 맞춘다)", () => {
    expect(clock(3750)).toBe("1:02:30");
  });
  it("음수는 0 으로", () => {
    expect(clock(-10)).toBe("0:00");
  });
});

describe("percent", () => {
  it("0~1 을 백분율로", () => {
    expect(percent(0)).toBe("0%");
    expect(percent(0.375)).toBe("38%");
    expect(percent(1)).toBe("100%");
  });
});

describe("date", () => {
  it("값이 없거나 형식이 틀리면 빈 문자열", () => {
    expect(date(null)).toBe("");
    expect(date("")).toBe("");
    expect(date("어제")).toBe("");
  });
  it("★한국 시간대로 읽는다 — UTC 로는 전날인 시각도 한국 날짜로 나온다", () => {
    // 2026-09-13T23:30Z = KST 2026-09-14 08:30
    expect(date("2026-09-13T23:30:00.000Z")).toContain("14");
  });
});

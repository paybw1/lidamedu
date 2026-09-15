import { describe, expect, it } from "vitest";

import { daysBetween, kstDate, pausedDaysWithin, usedDaysOf } from "./refund-usage";

describe("KST 달력일", () => {
  it("UTC 자정 직전도 KST 로는 다음 날이다", () => {
    // UTC 2026-09-14 23:30 = KST 2026-09-15 08:30
    expect(kstDate("2026-09-14T23:30:00Z")).toBe("2026-09-15");
    // UTC 2026-09-15 00:30 = KST 2026-09-15 09:30
    expect(kstDate("2026-09-15T00:30:00Z")).toBe("2026-09-15");
  });

  it("같은 날이면 0일, 하루 뒤면 1일", () => {
    expect(daysBetween("2026-09-15", "2026-09-15")).toBe(0);
    expect(daysBetween("2026-09-15", "2026-09-16")).toBe(1);
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1); // 월말
  });
});

describe("실제 이용일수 d (요청서 11-5)", () => {
  it("접수일 − 시작일 + 1 — 당일 신청도 1일이다", () => {
    expect(usedDaysOf({ usageStartDate: "2026-09-15", basisDate: "2026-09-15", pauses: [] }).usedDays).toBe(1);
    expect(usedDaysOf({ usageStartDate: "2026-09-01", basisDate: "2026-09-20", pauses: [] }).usedDays).toBe(20);
  });

  it("★수강 시작일 전이면 0일 — 연장분은 아직 시작하지 않았다", () => {
    const r = usedDaysOf({ usageStartDate: "2026-10-01", basisDate: "2026-09-15", pauses: [] });
    expect(r.usedDays).toBe(0);
    expect(r.pausedDays).toBe(0);
  });
});

describe("일시정지 제외 (요청서 11-5)", () => {
  it("계산 구간 안의 정지일만큼 이용일수가 줄어든다", () => {
    const r = usedDaysOf({
      usageStartDate: "2026-09-01",
      basisDate: "2026-09-20", // 20일
      pauses: [{ starts_on: "2026-09-05", ends_on: "2026-09-09", resumed_at: null }], // 5일
    });
    expect(r.pausedDays).toBe(5);
    expect(r.usedDays).toBe(15);
  });

  it("★조기 재개는 실제로 쉰 날까지만 뺀다 — days 를 그대로 빼면 안 된다", () => {
    // 9/5~9/14 (10일) 신청했다가 9/8 에 재개 → 실제로 쉰 날은 9/5~9/8 의 4일.
    const r = usedDaysOf({
      usageStartDate: "2026-09-01",
      basisDate: "2026-09-20",
      pauses: [{ starts_on: "2026-09-05", ends_on: "2026-09-14", resumed_at: "2026-09-08T03:00:00Z" }],
    });
    expect(r.pausedDays).toBe(4);
    expect(r.usedDays).toBe(16); // 20 − 4. days(10)를 그대로 뺐다면 10 이 됐다.
  });

  it("계산 구간 밖의 정지는 세지 않는다", () => {
    const r = usedDaysOf({
      usageStartDate: "2026-09-10",
      basisDate: "2026-09-20",
      pauses: [{ starts_on: "2026-09-01", ends_on: "2026-09-05", resumed_at: null }],
    });
    expect(r.pausedDays).toBe(0);
    expect(r.usedDays).toBe(11);
  });

  it("구간에 걸친 정지는 겹친 만큼만 센다", () => {
    // 정지 9/08~9/12 인데 계산 구간은 9/10 부터 → 겹침은 9/10~9/12 의 3일.
    expect(
      pausedDaysWithin(
        [{ starts_on: "2026-09-08", ends_on: "2026-09-12", resumed_at: null }],
        "2026-09-10",
        "2026-09-20",
      ),
    ).toBe(3);
  });

  it("정지가 여러 건이면 합산한다", () => {
    const r = usedDaysOf({
      usageStartDate: "2026-09-01",
      basisDate: "2026-09-30",
      pauses: [
        { starts_on: "2026-09-05", ends_on: "2026-09-06", resumed_at: null }, // 2일
        { starts_on: "2026-09-10", ends_on: "2026-09-12", resumed_at: null }, // 3일
      ],
    });
    expect(r.pausedDays).toBe(5);
    expect(r.usedDays).toBe(25);
  });

  it("정지가 이용기간 전체를 덮어도 음수가 되지 않는다", () => {
    const r = usedDaysOf({
      usageStartDate: "2026-09-01",
      basisDate: "2026-09-05",
      pauses: [{ starts_on: "2026-08-20", ends_on: "2026-09-30", resumed_at: null }],
    });
    expect(r.usedDays).toBe(0);
  });
});

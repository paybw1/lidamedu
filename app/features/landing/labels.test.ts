// 현장강의 마감 판정 테스트 (feat-11-012 P3).
//
// ★고치기 전 증상: 세 화면이 제각각 판정했고 셋 다 start_date 를 보지 않아,
//   **이미 개강한 강의가 「접수중 · 잔여 12」로** 남았다(D-day 배지만 조용히 사라진다).
//   지난 달 달력을 넘겨 보면 아직 신청할 수 있는 것처럼 보였다.

import { describe, expect, it } from "vitest";

import { scheduleState } from "./labels";

const TODAY = "2026-09-14T00:00:00.000Z";
const row = (over: Partial<Parameters<typeof scheduleState>[0]> = {}) => ({
  status: "open",
  start_date: "2026-10-01",
  capacity: 20,
  enrolled: 8,
  ...over,
});

describe("scheduleState", () => {
  it("개강 전 · 자리 있음 → 접수중", () => {
    const s = scheduleState(row(), TODAY);
    expect(s.code).toBe("open");
    expect(s.label).toBe("접수중");
    expect(s.closed).toBe(false);
    expect(s.seatsLeft).toBe(12);
    expect(s.dday).toBe(17);
  });

  it("★개강일이 지나면 마감 — 자리가 남아 있어도", () => {
    const s = scheduleState(row({ start_date: "2026-09-01" }), TODAY);
    expect(s.started).toBe(true);
    expect(s.closed).toBe(true);
    expect(s.label).toBe("마감");
    // 자리는 여전히 12석이지만 신청 가능으로 보이면 안 된다.
    expect(s.seatsLeft).toBe(12);
  });

  it("개강 당일은 아직 마감이 아니다", () => {
    const s = scheduleState(row({ start_date: "2026-09-14" }), TODAY);
    expect(s.dday).toBe(0);
    expect(s.started).toBe(false);
    expect(s.closed).toBe(false);
  });

  it("운영자가 건 마감이 가장 앞선다", () => {
    const s = scheduleState(row({ status: "closed" }), TODAY);
    expect(s.code).toBe("closed");
  });

  it("★대기접수는 자리가 0이어도 유지된다(중도 합류 허용 반의 출구)", () => {
    const s = scheduleState(
      row({ status: "waitlist", enrolled: 20 }),
      TODAY,
    );
    expect(s.code).toBe("waitlist");
    expect(s.label).toBe("대기접수");
    expect(s.closed).toBe(false);
  });

  it("자리가 0이면 마감", () => {
    const s = scheduleState(row({ enrolled: 20 }), TODAY);
    expect(s.code).toBe("closed");
    expect(s.seatsLeft).toBe(0);
  });

  it("임박은 D-N 을 라벨에 싣는다", () => {
    const s = scheduleState(
      row({ status: "soon", start_date: "2026-09-17" }),
      TODAY,
    );
    expect(s.label).toBe("D-3 임박");
  });

  it("개강일 미정이면 마감으로 보지 않는다", () => {
    const s = scheduleState(row({ start_date: null }), TODAY);
    expect(s.started).toBe(false);
    expect(s.dday).toBeNull();
    expect(s.closed).toBe(false);
  });
});

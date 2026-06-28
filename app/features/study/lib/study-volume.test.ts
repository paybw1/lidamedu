// feat-2-027 Phase 3 — 공부량 순수 계산 검산. 주별 합·증감·구간 버킷(순위 아님)·상위%.
import { describe, expect, it } from "vitest";

import {
  type DayStudy,
  bandForTopPercent,
  computeTopPercent,
  studyDeltaPct,
  weeklyStudyMs,
} from "./study-volume";

describe("weeklyStudyMs", () => {
  // 2024-01-08(월)~14(일) = 이번 주 기준 todayYmd=2024-01-10(수). 지난주 = 01-01~07.
  const days: DayStudy[] = [
    { date: "2024-01-06", timeMs: 1000 }, // 지난주 토
    { date: "2024-01-07", timeMs: 2000 }, // 지난주 일
    { date: "2024-01-08", timeMs: 3000 }, // 이번주 월
    { date: "2024-01-10", timeMs: 500 }, // 이번주 수(오늘)
    { date: "2024-01-12", timeMs: 9999 }, // 오늘 이후(제외)
  ];
  it("이번 주(월~오늘) / 지난 주(월~일) 분리 합산", () => {
    const w = weeklyStudyMs(days, "2024-01-10");
    expect(w.thisWeekMs).toBe(3500); // 08 + 10
    expect(w.lastWeekMs).toBe(3000); // 06 + 07
  });
});

describe("studyDeltaPct", () => {
  it("증가/감소/지난주0", () => {
    expect(studyDeltaPct(200, 100)).toBe(100);
    expect(studyDeltaPct(50, 100)).toBe(-50);
    expect(studyDeltaPct(500, 0)).toBeNull();
  });
});

describe("bandForTopPercent (순위 아님·바닥도 격려)", () => {
  it("경계별 구간", () => {
    expect(bandForTopPercent(10).label).toBe("상위권");
    expect(bandForTopPercent(25).label).toBe("상위권");
    expect(bandForTopPercent(26).label).toBe("평균 이상");
    expect(bandForTopPercent(50).label).toBe("평균 이상");
    expect(bandForTopPercent(75).label).toBe("중위 그룹");
    expect(bandForTopPercent(76).label).toBe("꾸준히 쌓는 중");
    expect(bandForTopPercent(100).label).toBe("꾸준히 쌓는 중");
  });
});

describe("computeTopPercent", () => {
  it("나보다 많은 멤버 비율(본인 포함 모집단)", () => {
    // 본인 300, peers [100,200,400] → 1명(400) 더 많음, 모집단 4 → 25%
    expect(computeTopPercent(300, [100, 200, 400])).toBe(25);
    // 최다 → 0%
    expect(computeTopPercent(500, [100, 200, 400])).toBe(0);
    // 최저(동률 아님) → 3/4 = 75%
    expect(computeTopPercent(50, [100, 200, 400])).toBe(75);
  });
});

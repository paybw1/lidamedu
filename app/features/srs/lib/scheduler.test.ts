import { describe, expect, it } from "vitest";

import {
  DEFAULT_EF,
  MIN_EF,
  type SrsCardState,
  newCardState,
  scheduleNext,
} from "./scheduler";

const FIXED_NOW = new Date(Date.UTC(2026, 5, 1, 0, 0, 0)); // 2026-06-01

function dayDiff(base: Date, target: Date): number {
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

describe("scheduleNext — 신규 카드 첫 회상", () => {
  it("q=5 (Easy) 첫 성공: interval=1, repetitions=1, state=review, EF +0.1", () => {
    const next = scheduleNext(newCardState(), 5, FIXED_NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(1);
    expect(next.state).toBe("review");
    expect(next.easeFactor).toBeCloseTo(2.6, 2);
    expect(next.lapses).toBe(0);
    expect(dayDiff(FIXED_NOW, next.dueDate)).toBe(1);
  });

  it("q=4 (Good) 첫 성공: interval=1, EF 변화 없음 (2.50)", () => {
    const next = scheduleNext(newCardState(), 4, FIXED_NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.5, 2);
    expect(next.repetitions).toBe(1);
  });

  it("q=3 (Hard) 첫 성공: interval=1, EF 살짝 감소 (2.36)", () => {
    const next = scheduleNext(newCardState(), 3, FIXED_NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.36, 2);
    expect(next.repetitions).toBe(1);
  });
});

describe("scheduleNext — 실패 (q<3)", () => {
  it("q=0 (Again) 신규 카드: relearning, interval=1, lapses=1, EF -0.8", () => {
    const next = scheduleNext(newCardState(), 0, FIXED_NOW);
    expect(next.state).toBe("relearning");
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(1);
    expect(next.lapses).toBe(1);
    // 2.5 + (0.1 - 5*(0.08 + 5*0.02)) = 2.5 - 0.8 = 1.7
    expect(next.easeFactor).toBeCloseTo(1.7, 2);
  });

  it("리뷰 단계에서 실패 → relearning + lapses 누적 + interval 1", () => {
    const reviewState: SrsCardState = {
      easeFactor: 2.5,
      intervalDays: 30,
      repetitions: 4,
      lapses: 1,
      state: "review",
    };
    const next = scheduleNext(reviewState, 0, FIXED_NOW);
    expect(next.state).toBe("relearning");
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(0);
    expect(next.lapses).toBe(2);
  });
});

describe("scheduleNext — 연속 성공 interval 누적", () => {
  it("repetitions=1 + q=4 → interval=6, repetitions=2", () => {
    const after1: SrsCardState = {
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      lapses: 0,
      state: "review",
    };
    const next = scheduleNext(after1, 4, FIXED_NOW);
    expect(next.intervalDays).toBe(6);
    expect(next.repetitions).toBe(2);
  });

  it("repetitions>=2 + q=4 → interval=round(prev*EF), EF 유지", () => {
    const state: SrsCardState = {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      lapses: 0,
      state: "review",
    };
    const next = scheduleNext(state, 4, FIXED_NOW);
    // round(6 * 2.5) = 15
    expect(next.intervalDays).toBe(15);
    expect(next.repetitions).toBe(3);
    expect(next.easeFactor).toBeCloseTo(2.5, 2);
  });

  it("q=5 연속 → EF 점진 증가, interval 가속", () => {
    let s: SrsCardState = newCardState();
    // 1st
    let r = scheduleNext(s, 5, FIXED_NOW);
    expect(r.intervalDays).toBe(1);
    s = { ...r };
    // 2nd
    r = scheduleNext(s, 5, FIXED_NOW);
    expect(r.intervalDays).toBe(6);
    expect(r.easeFactor).toBeCloseTo(2.7, 2);
    s = { ...r };
    // 3rd  — round(6 * 2.7) = 16
    r = scheduleNext(s, 5, FIXED_NOW);
    expect(r.intervalDays).toBe(16);
    expect(r.repetitions).toBe(3);
    expect(r.easeFactor).toBeCloseTo(2.8, 2);
  });
});

describe("scheduleNext — EF 1.3 하한 클램프", () => {
  it("q=0 반복 시 EF 1.3 미만으로 떨어지지 않음", () => {
    let s: SrsCardState = newCardState();
    for (let i = 0; i < 20; i++) {
      s = scheduleNext(s, 0, FIXED_NOW);
    }
    expect(s.easeFactor).toBe(MIN_EF);
    expect(s.lapses).toBe(20);
  });

  it("EF 클램프 직후 q=5 성공 → EF 증가 재개", () => {
    let s: SrsCardState = {
      easeFactor: MIN_EF,
      intervalDays: 1,
      repetitions: 0,
      lapses: 5,
      state: "relearning",
    };
    s = scheduleNext(s, 5, FIXED_NOW);
    expect(s.easeFactor).toBeCloseTo(1.4, 2);
    expect(s.state).toBe("review");
    expect(s.intervalDays).toBe(1);
    expect(s.repetitions).toBe(1);
  });
});

describe("scheduleNext — relearning 복귀", () => {
  it("relearning + q>=3 → review 로 복귀 (interval=1 부터 재시작)", () => {
    const s: SrsCardState = {
      easeFactor: 2.0,
      intervalDays: 1,
      repetitions: 0,
      lapses: 3,
      state: "relearning",
    };
    const next = scheduleNext(s, 4, FIXED_NOW);
    expect(next.state).toBe("review");
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(1);
    expect(next.lapses).toBe(3); // lapses 는 보존
  });
});

describe("scheduleNext — 기본값 & 입력 보존", () => {
  it("newCardState 초기값 — EF=2.5, interval=0, repetitions=0, state=new", () => {
    const s = newCardState();
    expect(s.easeFactor).toBe(DEFAULT_EF);
    expect(s.intervalDays).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.lapses).toBe(0);
    expect(s.state).toBe("new");
  });

  it("scheduleNext 는 입력 state 를 mutate 하지 않음 (순수 함수)", () => {
    const s = newCardState();
    const snapshot = { ...s };
    scheduleNext(s, 5, FIXED_NOW);
    expect(s).toEqual(snapshot);
  });

  it("now 미지정 시 현재 시각 기준 due 산출", () => {
    const before = Date.now();
    const r = scheduleNext(newCardState(), 4);
    const after = Date.now();
    const due = r.dueDate.getTime();
    // interval=1 일 → 86400000ms 더 큰 시점.
    expect(due - before).toBeGreaterThanOrEqual(86_400_000 - 1000);
    expect(due - after).toBeLessThanOrEqual(86_400_000 + 1000);
  });
});

// feat-2-027 Phase 1 — 단원 마스터리 순수 계산 검산.
// ★핵심 검증: 양치기 차단(시도 많아도 정답률 낮으면 절대 마스터 안 됨) + SRS 파지/밀림 게이트.
import { describe, expect, it } from "vitest";

import {
  MASTERY_FAMILIAR_ACC,
  MASTERY_MASTERED_ACC,
  type NodeMasteryInput,
  computeNodeMastery,
  summarizeMastery,
} from "./mastery";

const base: NodeMasteryInput = {
  attempts: 10,
  accuracyPct: 90,
  srsReps: 3,
  overdueCount: 0,
};

describe("computeNodeMastery", () => {
  it("미착수: 시도 0", () => {
    expect(computeNodeMastery({ ...base, attempts: 0 })).toBe("untouched");
  });

  it("학습 중: 시도 표본 미달", () => {
    expect(computeNodeMastery({ ...base, attempts: 3 })).toBe("learning");
  });

  it("학습 중: 표본은 충족하나 정답률 미달", () => {
    expect(
      computeNodeMastery({ ...base, attempts: 8, accuracyPct: 60 }),
    ).toBe("learning");
  });

  it("익숙: 정답률 FAMILIAR~MASTERED 사이, 파지 무관", () => {
    expect(
      computeNodeMastery({ ...base, accuracyPct: 75, srsReps: 0 }),
    ).toBe("familiar");
  });

  it("익숙(마스터 아님): 정답률 충분하나 SRS 파지(reps) 부족", () => {
    expect(computeNodeMastery({ ...base, accuracyPct: 90, srsReps: 1 })).toBe(
      "familiar",
    );
  });

  it("익숙(마스터 아님): 정답률·파지 충분하나 밀린 복습 있음", () => {
    expect(computeNodeMastery({ ...base, overdueCount: 1 })).toBe("familiar");
  });

  it("마스터: 정답률 + 표본 + 파지(reps≥2) + 밀림 0", () => {
    expect(computeNodeMastery(base)).toBe("mastered");
  });

  it("★양치기 차단: 시도 매우 많아도 정답률 낮으면 절대 마스터/익숙 불가", () => {
    expect(
      computeNodeMastery({
        attempts: 500,
        accuracyPct: 50,
        srsReps: 10,
        overdueCount: 0,
      }),
    ).toBe("learning");
  });

  it("경계: 정답률이 FAMILIAR 정확히 == 익숙", () => {
    expect(
      computeNodeMastery({
        ...base,
        accuracyPct: MASTERY_FAMILIAR_ACC,
        srsReps: 0,
      }),
    ).toBe("familiar");
  });

  it("경계: 정답률 MASTERED 정확히 + 파지 충족 == 마스터", () => {
    expect(
      computeNodeMastery({ ...base, accuracyPct: MASTERY_MASTERED_ACC }),
    ).toBe("mastered");
  });
});

describe("summarizeMastery", () => {
  it("단계 카운트 + progressed(익숙+마스터) 집계", () => {
    const s = summarizeMastery([
      "untouched",
      "learning",
      "learning",
      "familiar",
      "mastered",
      "mastered",
    ]);
    expect(s).toEqual({
      untouched: 1,
      learning: 2,
      familiar: 1,
      mastered: 2,
      progressed: 3,
      total: 6,
    });
  });

  it("빈 배열 안전", () => {
    expect(summarizeMastery([])).toEqual({
      untouched: 0,
      learning: 0,
      familiar: 0,
      mastered: 0,
      progressed: 0,
      total: 0,
    });
  });
});

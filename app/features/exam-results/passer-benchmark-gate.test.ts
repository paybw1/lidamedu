// 합격기준 SSoT 2층 구조 + recommendations 메시지 회귀 보호.
// (1) 법정 기준(statutory floor) — 과락 40 · 평균 60
// (2) 실측 합격선(operative target) — 공식 통계(`official-exam-stats.json`) 의 cut_line
// (3) pass-predict 임계값이 차수별로 분리돼 단순 60 룰을 노출하지 않음
// (4) recommendations OFF 분기가 "합격자 평균" 대신 "합격선" 어휘만 사용

import { describe, expect, it } from "vitest";

import {
  PASSER_BENCHMARK_MIN_SAMPLE,
  getDefaultPredictionThresholds,
  getOperativeTarget,
  getPassCriterion,
  getRound1PredictionThresholds,
  getRound2PredictionThresholds,
  getStatutoryFloor,
  isSubjectFloorFail,
  meetsAveragePass,
  operativeTargetLabel,
  statutoryFloorLabel,
} from "./pass-criteria";
import {
  OFFICIAL_EXAM_STATS,
  getLatestRoundStat,
  getRecentCutLineAvg,
  getRound1SubjectStats,
  getRound2RequiredSubjectStats,
} from "./official-stats";
import { generateRecommendedActions } from "./recommendations";

/* ── Layer 1 — 법정 기준 ─────────────────────────────────────────── */

describe("Layer 1 — statutory floor", () => {
  it("1차 = 과락 40 · 평균 60", () => {
    expect(getStatutoryFloor("first")).toEqual({
      subjectFloor: 40,
      averagePass: 60,
    });
  });
  it("2차 = 과락 40 · 평균 60", () => {
    expect(getStatutoryFloor("second")).toEqual({
      subjectFloor: 40,
      averagePass: 60,
    });
  });
  it("isSubjectFloorFail / meetsAveragePass", () => {
    expect(isSubjectFloorFail("first", 39)).toBe(true);
    expect(isSubjectFloorFail("first", 40)).toBe(false);
    expect(meetsAveragePass("first", 60)).toBe(true);
    expect(meetsAveragePass("second", 59.9)).toBe(false);
  });
  it("표본 임계값", () => {
    expect(PASSER_BENCHMARK_MIN_SAMPLE).toBe(10);
  });
});

/* ── Layer 2 — 실측 합격선 ────────────────────────────────────────── */

describe("Layer 2 — operative target (공식 통계 cut_line)", () => {
  it("1차 cut_line 평균은 평균 60 보다 훨씬 높음 (~80 근처)", () => {
    const t = getOperativeTarget("first");
    expect(t.recentCutLine).not.toBeNull();
    expect(t.recentCutLine!).toBeGreaterThan(70);
    expect(t.recentCutLine!).toBeLessThan(90);
  });
  it("2차 cut_line 평균은 60 보다 낮음 (~54 근처)", () => {
    const t = getOperativeTarget("second");
    expect(t.recentCutLine).not.toBeNull();
    expect(t.recentCutLine!).toBeLessThan(60);
    expect(t.recentCutLine!).toBeGreaterThan(45);
  });
  it("cut_line null 인 연도는 표본에서 자동 제외 (1차 2021·2023)", () => {
    const summary = getRecentCutLineAvg("first", 10);
    expect(summary).not.toBeNull();
    // 2021, 2023 1차 cut_line=null. 표본 연도 ≤ (전체-2).
    expect(summary!.sampleYears).toBeLessThanOrEqual(
      OFFICIAL_EXAM_STATS.round1.by_year.length - 2,
    );
  });
  it("getLatestRoundStat — 1차/2차 모두 row 반환", () => {
    expect(getLatestRoundStat("first")).not.toBeNull();
    expect(getLatestRoundStat("second")).not.toBeNull();
  });
});

/* ── pass-predict 임계값 — 차수별 분리 ───────────────────────────── */

describe("pass-predict thresholds — 단순 60 룰 금지, 차수별 분리", () => {
  it("1차 ok 임계값 > 60 (실측 합격선 사용)", () => {
    const th = getRound1PredictionThresholds();
    expect(th.ok).toBeGreaterThan(60);
  });
  it("2차 ok 임계값 < 60 (실측 합격선 사용)", () => {
    const th = getRound2PredictionThresholds();
    expect(th.ok).toBeLessThan(60);
  });
  it("두 차수 임계값은 서로 다름 (60 단순룰 아님)", () => {
    expect(getRound1PredictionThresholds().ok).not.toBe(
      getRound2PredictionThresholds().ok,
    );
  });
  it("caution = 법정 과락선 40", () => {
    expect(getRound1PredictionThresholds().caution).toBe(40);
    expect(getRound2PredictionThresholds().caution).toBe(40);
  });
  it("default = 1차 (학생 비중 큼)", () => {
    expect(getDefaultPredictionThresholds().ok).toBe(
      getRound1PredictionThresholds().ok,
    );
  });
  it("basisLabel 에 데이터 출처 명시", () => {
    expect(getRound1PredictionThresholds().basisLabel).toContain("공식");
  });
});

/* ── 라벨 ─────────────────────────────────────────────────────────── */

describe("라벨 (UI 노출)", () => {
  it("statutoryFloorLabel 은 법정 기준만 노출", () => {
    expect(statutoryFloorLabel("first")).toContain("40");
    expect(statutoryFloorLabel("first")).toContain("60");
    expect(statutoryFloorLabel("first")).toContain("1차");
  });
  it("operativeTargetLabel 은 실측 합격선 + 연도 범위", () => {
    expect(operativeTargetLabel("first")).toContain("실측 합격선");
    expect(operativeTargetLabel("first")).toContain("개년 평균");
  });
});

describe("getPassCriterion — UI 단일 진입점", () => {
  it("floor + target 동시 반환", () => {
    const c = getPassCriterion("first");
    expect(c.floor.subjectFloor).toBe(40);
    expect(c.target.recentCutLine).not.toBeNull();
  });
});

/* ── 과목별 통계 ─────────────────────────────────────────────────── */

describe("과목별 평균/과락률 (공식 통계)", () => {
  it("1차 — 3 과목 모두 row 보유 + fail_rate 0~100", () => {
    const stats = getRound1SubjectStats(5);
    expect(stats.length).toBe(3);
    for (const s of stats) {
      expect(s.failRateAcrossYears).toBeGreaterThanOrEqual(0);
      expect(s.failRateAcrossYears).toBeLessThanOrEqual(100);
    }
  });
  it("2차 — 3 필수과목 row 보유", () => {
    const stats = getRound2RequiredSubjectStats(5);
    expect(stats.length).toBe(3);
  });
});

/* ── recommendations OFF 분기 — 합격자 평균 어휘 금지 ─────────────── */

describe("recommendations — 게이트 OFF 시 합격선 어휘만", () => {
  function baseInput(opts: { acc?: number; examRound?: "first" | "second" }) {
    const accuracy = opts.acc ?? 50;
    // pass-predict 의 thresholds 를 동기 import 해서 사용.
    const th =
      opts.examRound === "second"
        ? getRound2PredictionThresholds()
        : getRound1PredictionThresholds();
    return {
      benchmark: null, // 게이트 OFF
      failerBaseline: null,
      passerLawAverages: {},
      weakAreas: [],
      weakNodes: [],
      pendingAssignments: [],
      dailyStats: {
        currentStreak: 5,
        totalActiveDays: 10,
        avgHoursPerActiveDay: 2,
      },
      passPrediction: {
        score: accuracy,
        rating: "주의" as const,
        components: {
          study: 50,
          accuracy,
          gs: null,
          activity: 70,
          completion: 80,
        },
        hint: "",
        basisLabel: th.basisLabel,
        thresholds: th,
      },
      hasExamPlan: true,
    };
  }

  it("1차 학생 — 정답률 70 (실측 합격선 ~80 미만) → criterion-below-average 발화 + 합격선 어휘", () => {
    const actions = generateRecommendedActions(baseInput({ acc: 70 }));
    const below = actions.find((a) => a.id === "criterion-below-average");
    expect(below).toBeDefined();
    expect(below!.body).toContain("실측 합격선");
    // 합격자 평균 어휘 금지.
    for (const a of actions) {
      expect(a.body).not.toContain("합격자 평균 ");
    }
  });

  it("정답률 35 → 과락선 액션 high", () => {
    const actions = generateRecommendedActions(baseInput({ acc: 35 }));
    const floor = actions.find((a) => a.id === "criterion-below-floor");
    expect(floor).toBeDefined();
    expect(floor!.priority).toBe("high");
    expect(floor!.body).toContain("40");
  });

  it("2차 학생 — 정답률 70 (실측 합격선 ~54 초과) → safe celebrate", () => {
    const actions = generateRecommendedActions(
      baseInput({ acc: 70, examRound: "second" }),
    );
    const safe = actions.find((a) => a.id === "criterion-safe");
    expect(safe).toBeDefined();
    expect(safe!.priority).toBe("celebrate");
  });

  it("no-benchmark 안내 본문에 공식 합격선 출처 명시", () => {
    const actions = generateRecommendedActions(baseInput({}));
    const nb = actions.find((a) => a.id === "no-benchmark");
    expect(nb).toBeDefined();
    expect(nb!.body).toContain("공식 합격선");
    expect(nb!.body).not.toContain("합격자 평균 ");
  });
});

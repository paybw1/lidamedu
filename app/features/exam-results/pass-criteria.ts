// 변리사 시험 합격 기준 SSoT — 2층 구조.
//
//  Layer 1 (statutory floor) — 시험제도 규칙. **하드 룰**.
//    1차: 과목 40 미만 과락 + 3과목 평균 60 + 600명(3배수) 상대선발
//    2차: 필수 과목 40 미만 과락 + 평균 60 + 선택 P/F(50) + 최소인원 보정
//
//  Layer 2 (operative target) — **실측 합격선**. 한국산업인력공단 공식 통계.
//    1차 cut_line 최근 3개년 중앙값 ≈ 80 (평균 60보다 훨씬 높음, 상대 3배수)
//    2차 cut_line 최근 3개년 중앙값 ≈ 54 (평균 60보다 낮음, 최소인원 보정)
//
// **핵심 함정**: 단순 "평균 60 룰" 을 학생에게 목표로 노출하면
//   - 1차: 과소목표 (실제 합격선 ~80)
//   - 2차: 과대목표 (실제 합격선 ~54)
//   둘 다 잘못된 신호.
//
// 데이터는 `data/official-exam-stats.json` 만 참조 — 본 모듈에 숫자 하드코딩 금지.
// 매 연도 새 시험 발표 후 JSON 만 갱신하면 자동 반영. (연 1회 갱신 동선 — README)
import {
  OFFICIAL_EXAM_STATS,
  type Round1YearStat,
  type Round2YearStat,
  getRecentCutLineAvg,
} from "./official-stats";

export type ExamRound = "first" | "second";

/** 합격자 비교 기능 최소 표본 임계값 (A3 게이트, 합격자-패턴 활성화 기준). */
export const PASSER_BENCHMARK_MIN_SAMPLE = 10;

/* ── Layer 1 — 법정 기준 (statutory floor) ─────────────────────────── */

export interface StatutoryFloor {
  /** 한 과목 점수 미달 시 과락. */
  subjectFloor: number;
  /** 전 과목 평균 자격선. */
  averagePass: number;
}

/**
 * 법정 기준 — `data/official-exam-stats.json` 의 `statutory_criteria` 를 단일 SSoT로
 * 노출. 1차/2차 모두 동일하게 과목 40·평균 60.
 */
export function getStatutoryFloor(round: ExamRound): StatutoryFloor {
  if (round === "first") {
    return {
      subjectFloor: OFFICIAL_EXAM_STATS.round1.statutory_criteria.subject_floor,
      averagePass: OFFICIAL_EXAM_STATS.round1.statutory_criteria.average,
    };
  }
  return {
    subjectFloor:
      OFFICIAL_EXAM_STATS.round2.statutory_criteria.required_subject_floor,
    averagePass: OFFICIAL_EXAM_STATS.round2.statutory_criteria.required_average,
  };
}

/* ── Layer 2 — 실측 운영 목표 (operative target) ──────────────────── */

export interface OperativeTarget {
  /** 학생에게 노출할 현실 목표 점수 (최근 5개년 cut_line 평균, 소수 1자리). null = 가용 데이터 없음. */
  recentCutLine: number | null;
  /** 표본 연도 수. */
  sampleYears: number;
  /** 표본 연도 범위 (최소·최대). */
  yearRange: { min: number; max: number } | null;
  /** "데이터 없음" 사유 (null 일 때 채워짐). */
  unavailableReason: string | null;
  /** 가장 최근 단일 cut_line — UI 부가 정보용. */
  latestCutLine: number | null;
  latestYear: number | null;
}

/**
 * 실측 합격선 — 최근 cut_line 평균. null 인 연도(2021·2023 1차) 자동 제외.
 * 데이터 없음(예: 표본 0) 이면 unavailableReason 명시. **절대 추정/보간 금지**.
 */
export function getOperativeTarget(
  round: ExamRound,
  recentYears = 5,
): OperativeTarget {
  const summary = getRecentCutLineAvg(round, recentYears);
  if (!summary) {
    return {
      recentCutLine: null,
      sampleYears: 0,
      yearRange: null,
      unavailableReason: "공식 합격선 통계 미공개",
      latestCutLine: null,
      latestYear: null,
    };
  }
  // 가장 최근 cut_line 단일값.
  const rows: (Round1YearStat | Round2YearStat)[] =
    round === "first"
      ? OFFICIAL_EXAM_STATS.round1.by_year
      : OFFICIAL_EXAM_STATS.round2.by_year;
  const latest = rows
    .filter((r) => r.cut_line !== null)
    .sort((a, b) => b.year - a.year)[0];
  return {
    recentCutLine: summary.avg,
    sampleYears: summary.sampleYears,
    yearRange: { min: summary.minYear, max: summary.maxYear },
    unavailableReason: null,
    latestCutLine: latest?.cut_line ?? null,
    latestYear: latest?.year ?? null,
  };
}

/* ── 통합 기준 — UI/recommendations 진입점 ───────────────────────── */

export interface PassCriterionView {
  round: ExamRound;
  floor: StatutoryFloor;
  target: OperativeTarget;
}

export function getPassCriterion(round: ExamRound): PassCriterionView {
  return {
    round,
    floor: getStatutoryFloor(round),
    target: getOperativeTarget(round),
  };
}

/* ── 헬퍼 ─────────────────────────────────────────────────────────── */

/** 과목 점수가 법정 과락(40 미만)인지. */
export function isSubjectFloorFail(round: ExamRound, score: number): boolean {
  return score < getStatutoryFloor(round).subjectFloor;
}

/** 평균이 법정 자격선(60 이상) 도달했는지. */
export function meetsAveragePass(round: ExamRound, average: number): boolean {
  return average >= getStatutoryFloor(round).averagePass;
}

/**
 * 학생 화면 한 줄 라벨 — **법정 자격선** 기준.
 * 실측 합격선은 별도 라벨(`operativeTargetLabel`) 로 노출해 혼동 차단.
 */
export function statutoryFloorLabel(round: ExamRound): string {
  const f = getStatutoryFloor(round);
  const roundLabel = round === "first" ? "1차" : "2차";
  return `평균 ${f.averagePass}점 이상 + 과목 ${f.subjectFloor}점 미만 없음 (${roundLabel} 법정 기준)`;
}

/**
 * 학생 화면 한 줄 라벨 — **실측 합격선** 기준. 데이터 없음 시 안내.
 */
export function operativeTargetLabel(round: ExamRound): string {
  const t = getOperativeTarget(round);
  const roundLabel = round === "first" ? "1차" : "2차";
  if (t.recentCutLine === null) {
    return `${roundLabel} 실측 합격선 — ${t.unavailableReason ?? "데이터 없음"}`;
  }
  return `${roundLabel} 실측 합격선 ≈ ${t.recentCutLine}점 (${t.yearRange!.min}~${t.yearRange!.max} ${t.sampleYears}개년 평균)`;
}

/* ── pass-predict 임계값 — 차수별 분리 ──────────────────────────────
 *
 * 1차 단일 score 모델 임계값 — 최근 cut_line 기반.
 * 2차도 동일 패턴이지만 cut_line 이 60 미만이라 임계값 분포 다름.
 *
 * pass-predict 가 차수를 모르고 호출되는 케이스(레거시 dashboard) 는
 * `getRound1PredictionThresholds()` 를 default 로 사용 (1차 학생 비중이 큼).
 */

export interface PredictionThresholds {
  /** safe — 안정권 (실측 합격선 + 마진). */
  safe: number;
  /** ok — 합격선 도달. */
  ok: number;
  /** caution — 과락선만 통과 (법정 floor). */
  caution: number;
  /** 출처 라벨 — UI 노출용. */
  basisLabel: string;
}

function buildThresholds(round: ExamRound): PredictionThresholds {
  const floor = getStatutoryFloor(round);
  const target = getOperativeTarget(round);

  if (target.recentCutLine !== null) {
    const ok = Math.round(target.recentCutLine); // 합격선 도달
    const safeMargin = round === "first" ? 5 : 3; // 1차 안정권 더 보수적
    return {
      safe: Math.min(100, ok + safeMargin),
      ok,
      caution: floor.subjectFloor,
      basisLabel: `${target.yearRange!.min}~${target.yearRange!.max} 공식 합격선 평균 (${target.sampleYears}개년)`,
    };
  }
  // 데이터 없음 fallback — 법정 자격선만 사용.
  return {
    safe: floor.averagePass + 20,
    ok: floor.averagePass,
    caution: floor.subjectFloor,
    basisLabel: "공식 합격선 데이터 없음 — 법정 자격선만 사용",
  };
}

export function getRound1PredictionThresholds(): PredictionThresholds {
  return buildThresholds("first");
}

export function getRound2PredictionThresholds(): PredictionThresholds {
  return buildThresholds("second");
}

/** 차수 미지정 시 1차 임계값 default. */
export function getDefaultPredictionThresholds(): PredictionThresholds {
  return getRound1PredictionThresholds();
}

/* ── 1차 과목별 점수 → 합격 판정 (자가입력 보조) ─────────────────────
 *
 * 도메인 결정(확정): "확정 가능한 것만 확정, 불확실은 추정/자가신고".
 *   - 과락(과목 40 미만) = 법정 기준 → **불합격 확정**(커트라인 무관).
 *   - 평균 60 미만 = 법정 자격선 미달 → **불합격 확정**(전 과목 입력 시).
 *   - 그 외 = 상대선발이라 확정 불가 → cut_line 대비 **추정**(확정 아님), cut_line 미공개면 **판정 대기**.
 * status(합/불) 자체는 자가신고 유지 — 본 판정은 derived projection(표시·안내용).
 */

/** 1차 과목 SSOT — official-exam-stats.json statutory_criteria.subjects(산업재산권법·민법개론·자연과학개론). */
export const FIRST_ROUND_SUBJECTS: readonly string[] =
  OFFICIAL_EXAM_STATS.round1.statutory_criteria.subjects;

/**
 * 2차 필수 과목 SSOT — official-exam-stats.json round2.statutory_criteria.required_subjects
 * (특허법·상표법·민사소송법). 선택과목 1개는 응시자가 과목명+점수를 직접 입력(P/F·평균 미산입).
 */
export const SECOND_ROUND_REQUIRED_SUBJECTS: readonly string[] =
  OFFICIAL_EXAM_STATS.round2.statutory_criteria.required_subjects;

export type FirstRoundVerdict =
  | "floor_fail" // 과락 — 불합격 확정
  | "average_fail" // 평균 미달 — 불합격 확정
  | "estimated_pass" // 합격권 추정(확정 아님)
  | "estimated_below" // 합격선 미달 추정(확정 아님)
  | "pending"; // 판정 대기(부분 입력 / cut_line 미공개)

export interface FirstRoundJudgment {
  verdict: FirstRoundVerdict;
  /** 입력된 과목 평균(부분 입력이면 부분 평균). null = 입력 0. */
  average: number | null;
  /** 과락 과목명. */
  failedSubjects: string[];
  /** 비교에 쓴 실측 합격선(없으면 null). */
  cutLine: number | null;
  /** 확정(과락/평균미달)인가, 추정/대기인가. */
  isConfirmed: boolean;
  /** 학생 표시용 한 줄. */
  label: string;
}

/**
 * 1차 과목별 자가입력 점수 → 합격 판정(보조). 순수 함수 — 입력 허브·결과 화면 공용.
 * subjectScores: { 과목명: 점수 } (일부만 있을 수 있음).
 */
export function judgeFirstRoundResult(
  subjectScores: Record<string, number>,
): FirstRoundJudgment {
  const entries = FIRST_ROUND_SUBJECTS.map(
    (s) => [s, subjectScores[s]] as const,
  ).filter(([, v]) => typeof v === "number" && Number.isFinite(v));

  if (entries.length === 0) {
    return {
      verdict: "pending",
      average: null,
      failedSubjects: [],
      cutLine: null,
      isConfirmed: false,
      label: "과목 점수 입력 시 판정",
    };
  }

  const failedSubjects = entries
    .filter(([, v]) => isSubjectFloorFail("first", v))
    .map(([k]) => k);
  const average =
    Math.round(
      (entries.reduce((s, [, v]) => s + v, 0) / entries.length) * 100,
    ) / 100;

  // 과락 = 불합격 확정(법정, 커트라인 무관).
  if (failedSubjects.length > 0) {
    return {
      verdict: "floor_fail",
      average,
      failedSubjects,
      cutLine: null,
      isConfirmed: true,
      label: `과락(${failedSubjects.join("·")} 40점 미만) — 불합격 확정`,
    };
  }

  const allEntered = entries.length === FIRST_ROUND_SUBJECTS.length;

  // 평균 60 미만 = 법정 자격선 미달 = 불합격 확정(전 과목 입력 시에만).
  if (allEntered && !meetsAveragePass("first", average)) {
    return {
      verdict: "average_fail",
      average,
      failedSubjects: [],
      cutLine: null,
      isConfirmed: true,
      label: `평균 ${average}점 < 60점(법정 자격선) — 불합격 확정`,
    };
  }

  // 여기부터 추정(상대선발이라 확정 불가).
  const cutLine = getOperativeTarget("first").recentCutLine;
  if (!allEntered) {
    return {
      verdict: "pending",
      average,
      failedSubjects: [],
      cutLine,
      isConfirmed: false,
      label: "전 과목 점수 입력 시 합격 추정",
    };
  }
  if (cutLine === null) {
    return {
      verdict: "pending",
      average,
      failedSubjects: [],
      cutLine: null,
      isConfirmed: false,
      label: `평균 ${average}점 · 과락 없음 — 합격선 미공개로 판정 대기`,
    };
  }
  if (average >= cutLine) {
    return {
      verdict: "estimated_pass",
      average,
      failedSubjects: [],
      cutLine,
      isConfirmed: false,
      label: `평균 ${average}점 ≥ 실측 합격선 ≈${cutLine}점 — 합격권 추정(확정 아님)`,
    };
  }
  return {
    verdict: "estimated_below",
    average,
    failedSubjects: [],
    cutLine,
    isConfirmed: false,
    label: `평균 ${average}점 < 실측 합격선 ≈${cutLine}점 — 합격선 미달 추정(확정 아님)`,
  };
}

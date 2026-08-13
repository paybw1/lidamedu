// feat-2-027 Phase 3 — 공부량(학습시간) 순수 계산. 자기성장(주별, ★주축) + 코호트 구간 버킷(★순위 아님).
// 학습시간 SSOT = user_problem_attempts.time_spent_ms 합. 날짜는 KST "YYYY-MM-DD" 문자열 비교.
import { mondayOf } from "./streak";

// B1 — 문항 단위 시간 상한 (탭 방치 방어). 객관식 한 문항의 정상 최대치를 넉넉히
// 잡은 값 — 기록 경로(OMR 시트 등)가 공유하는 단일 상수.
export const PER_QUESTION_TIME_CAP_MS = 30 * 60_000;

/**
 * B1 — 문항별 소요시간 계산 (OMR 시트 등 "직전 조작 기준" 기록 경로 공용).
 * - 시작점 = 직전 조작 시각(실제 조작 순서 기준 — 문항 순서 아님)
 * - 이미 답한 문항의 수정 = 0ms (최초 응답까지의 시간 유지, 수정에 시간 미부과)
 * - 상한 = PER_QUESTION_TIME_CAP_MS (탭 방치 방어)
 */
export function computePerQuestionTimeMs(
  nowMs: number,
  lastActionAtMs: number,
  isRevision: boolean,
): number {
  if (isRevision) return 0;
  return Math.min(PER_QUESTION_TIME_CAP_MS, Math.max(0, nowMs - lastActionAtMs));
}

export interface DayStudy {
  date: string; // KST YYYY-MM-DD
  timeMs: number;
}

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface WeekStudy {
  thisWeekMs: number;
  lastWeekMs: number;
}

/** 이번 주(월~오늘) / 지난 주(월~일) 학습시간 합(ms). */
export function weeklyStudyMs(days: DayStudy[], todayYmd: string): WeekStudy {
  const thisMon = mondayOf(todayYmd);
  const lastMon = shiftYmd(thisMon, -7);
  const lastSun = shiftYmd(thisMon, -1);
  let thisWeekMs = 0;
  let lastWeekMs = 0;
  for (const d of days) {
    if (d.date >= thisMon && d.date <= todayYmd) thisWeekMs += d.timeMs;
    else if (d.date >= lastMon && d.date <= lastSun) lastWeekMs += d.timeMs;
  }
  return { thisWeekMs, lastWeekMs };
}

/** 지난주 대비 증감 %(반올림). 지난주 0이면 null(비교 불가 = 첫 주). */
export function studyDeltaPct(
  thisWeekMs: number,
  lastWeekMs: number,
): number | null {
  if (lastWeekMs <= 0) return null;
  return Math.round(((thisWeekMs - lastWeekMs) / lastWeekMs) * 100);
}

// 코호트 구간 — ★순위 아님(1~N 리더보드 금지). 바닥도 격려 명칭(망신 X).
export const COHORT_BANDS = [
  { maxTopPercent: 25, key: "top", label: "상위권" },
  { maxTopPercent: 50, key: "above", label: "평균 이상" },
  { maxTopPercent: 75, key: "mid", label: "중위 그룹" },
  { maxTopPercent: 100, key: "building", label: "꾸준히 쌓는 중" },
] as const;
export type CohortBand = (typeof COHORT_BANDS)[number];

export function bandForTopPercent(topPercent: number): CohortBand {
  for (const b of COHORT_BANDS) if (topPercent <= b.maxTopPercent) return b;
  return COHORT_BANDS[COHORT_BANDS.length - 1];
}

/**
 * "상위 N%" = 나보다 학습시간이 많은 멤버 비율(본인 포함 모집단 기준).
 * peerMsList = 본인 제외 동의 peer 들의 학습시간. 낮을수록 상위.
 */
export function computeTopPercent(myMs: number, peerMsList: number[]): number {
  const total = peerMsList.length + 1;
  if (total <= 1) return 100; // 나뿐 = 비교 무의미(호출부 표본 가드가 먼저 거름)
  const more = peerMsList.filter((m) => m > myMs).length;
  return Math.round((more / total) * 100);
}

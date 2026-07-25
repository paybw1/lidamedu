// feat-2-010 SRS — 순수 알고리즘 (클라/서버 공용).
// Simplified SM-2.

export interface SrsState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface SrsInput {
  prev: SrsState | null;
  isCorrect: boolean;
}

export interface SrsResult extends SrsState {
  nextDueAt: Date;
  lastQuality: 0 | 1;
}

const MAX_INTERVAL_DAYS = 90;
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
const EASE_PENALTY = 0.2;

// feat-2-031 — 하루 복습 노출 상한(부담 조절). 밀린 due 가 아무리 많아도 한 번에 이만큼만
//   '오래된 것 우선' 노출해 "산더미 → 포기" 를 막는다. 나머지는 '밀림'으로 부드럽게 안내.
//   복습 종류별로 각각 적용(문제·빈칸 세트·정오·조문 정독). 값은 합리적 기본값(추후 사용자 조절 편입 가능).
export const DAILY_REVIEW_BUDGET = 40;

/** 밀림 표시용 — 총 due 대비 오늘 노출/밀림 수를 나눠 반환. */
export function splitReviewBudget(
  totalDue: number,
  budget: number = DAILY_REVIEW_BUDGET,
): { shown: number; backlog: number } {
  const shown = Math.min(totalDue, budget);
  return { shown, backlog: Math.max(0, totalDue - shown) };
}

/** SM-2 simplified — 다음 SRS 상태 계산. 시간 미정 시 now=Date(). */
export function computeNextSrsState(
  input: SrsInput,
  now: Date = new Date(),
): SrsResult {
  const { prev, isCorrect } = input;

  if (!isCorrect) {
    const lapses = (prev?.lapses ?? 0) + 1;
    const ease = Math.max(MIN_EASE, (prev?.ease ?? DEFAULT_EASE) - EASE_PENALTY);
    const intervalDays = 1;
    return {
      intervalDays,
      ease,
      reps: 0,
      lapses,
      nextDueAt: addDays(now, intervalDays),
      lastQuality: 0,
    };
  }

  // 정답.
  const prevReps = prev?.reps ?? 0;
  const prevInterval = prev?.intervalDays ?? 1;
  const ease = prev?.ease ?? DEFAULT_EASE;
  const lapses = prev?.lapses ?? 0;

  let reps: number;
  let intervalDays: number;
  if (prevReps === 0) {
    reps = 1;
    intervalDays = 1;
  } else if (prevReps === 1) {
    reps = 2;
    intervalDays = 3;
  } else if (prevReps === 2) {
    reps = 3;
    intervalDays = 7;
  } else {
    reps = prevReps + 1;
    intervalDays = Math.round(prevInterval * ease);
  }
  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);

  return {
    intervalDays,
    ease,
    reps,
    lapses,
    nextDueAt: addDays(now, intervalDays),
    lastQuality: 1,
  };
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

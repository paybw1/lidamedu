// SRS v2 — SM-2 스케줄러 (순수 함수).
// 클라/서버 공용. DB·React 의존 없음.
//
// 입력: 현재 카드 상태 + 회상 품질 q (0~5).
// 출력: 갱신된 카드 상태 + 다음 due_date.
//
// UI 4 버튼 매핑:
//   Again = 0  / Hard = 3  / Good = 4  / Easy = 5
//
// 알고리즘 (사용자 스펙):
//   q < 3 (실패): repetitions=0, interval=1, state=relearning, lapses+1
//   q >= 3 (성공):
//     repetitions == 0 → interval = 1
//     repetitions == 1 → interval = 6
//     그 외          → interval = round(prev_interval * EF)
//     repetitions += 1
//   EF 갱신 (성공·실패 공통):
//     EF = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
//     EF < 1.3 → 1.3 으로 클램프
//   due_date = today + interval(일)
//
// FSRS 등으로 교체 가능하도록 SrsScheduler 인터페이스 분리.

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
export type SrsState = "new" | "learning" | "review" | "relearning";

export interface SrsCardState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  state: SrsState;
}

export interface SrsScheduleResult extends SrsCardState {
  /** today + intervalDays. now 인자가 주어지면 그 기준. */
  dueDate: Date;
}

export interface SrsScheduler {
  scheduleNext(
    state: SrsCardState,
    q: Grade,
    now?: Date,
  ): SrsScheduleResult;
}

export const DEFAULT_EF = 2.5;
export const MIN_EF = 1.3;

/** 새 카드 초기 상태. DB default 와 동일. */
export function newCardState(): SrsCardState {
  return {
    easeFactor: DEFAULT_EF,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    state: "new",
  };
}

/** SM-2 다음 상태 계산. now 미지정 시 new Date(). */
export function scheduleNext(
  state: SrsCardState,
  q: Grade,
  now: Date = new Date(),
): SrsScheduleResult {
  const fail = q < 3;

  let intervalDays: number;
  let repetitions: number;
  let lapses = state.lapses;
  let nextState: SrsState;

  if (fail) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
    nextState = "relearning";
  } else {
    if (state.repetitions === 0) {
      intervalDays = 1;
    } else if (state.repetitions === 1) {
      intervalDays = 6;
    } else {
      // 첫·두 번째 성공 이후는 prev_interval * EF.
      intervalDays = Math.round(state.intervalDays * state.easeFactor);
      // round 가 0 을 만들지 않도록 안전 가드 (e.g., prev=0, ef=1.3 → 0).
      if (intervalDays < 1) intervalDays = 1;
    }
    repetitions = state.repetitions + 1;
    nextState = "review";
  }

  // EF 갱신 — 성공·실패 공통 공식. 소수점 노이즈 정리 (round to 2 decimals).
  const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const efRaw = state.easeFactor + efDelta;
  const easeFactor = Math.max(MIN_EF, Math.round(efRaw * 100) / 100);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    state: nextState,
    dueDate: addDays(now, intervalDays),
  };
}

function addDays(base: Date, days: number): Date {
  const out = new Date(base.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** scheduleNext 만 노출하는 기본 구현. FSRS 등으로 swap 가능. */
export const sm2Scheduler: SrsScheduler = { scheduleNext };

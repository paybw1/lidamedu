// feat-7-048 Stage E — 타이머 순수 계산. 클라(경과 표시)와 서버(확정)가 함께 쓴다.
//
// ★서버리스라 서버가 타이머를 돌리지 않는다. 시작·정지·종료 시각만 기록하고,
//   경과는 언제든 이 함수로 다시 계산한다(브라우저가 죽어도 값이 복원된다).
import { kstDateTimeToISO } from "../labels";

/** 한 세션 상한 — 넘으면 자동 확정하지 않고 사람이 시간을 확인한다. */
export const TIMER_MAX_MINUTES = 12 * 60;

export interface TimerState {
  startedAt: string;
  /** 일시정지 누적(ms). */
  pausedMs: number;
  /** 지금 정지 중이면 정지 시작 시각. */
  pausedAt: string | null;
  endedAt?: string | null;
}

/** 실제로 공부한 시간(ms) — 일시정지 구간은 뺀다. */
export function elapsedMs(s: TimerState, nowMs: number): number {
  const end = s.endedAt ? Date.parse(s.endedAt) : nowMs;
  const pausedNow = s.pausedAt ? Math.max(0, end - Date.parse(s.pausedAt)) : 0;
  return Math.max(0, end - Date.parse(s.startedAt) - s.pausedMs - pausedNow);
}

/** 경과 ms → "1:23:45" (타이머 표시). */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface TimerSplitPart {
  /** KST 날짜 — 이 부분이 귀속될 log_date. */
  logDate: string;
  minutes: number;
  /** 이 부분의 시작 시각(ISO) — 시간표 타일에 놓이는 기준. */
  startedAt: string;
}

/** ISO → KST 날짜(YYYY-MM-DD). */
function kstDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 세션을 날짜별로 쪼갠다 — 자정을 넘긴 공부는 두 날에 나눠 기록한다.
 * (시간표 축이 0~24시라 한 덩어리로 두면 어느 날에도 제대로 그릴 수 없다.)
 *
 * 분 배분은 **벽시계 비율**로 한다. 일시정지가 어느 날에 있었는지까지 추적하면
 * 정확해지지만, 그 정밀도가 학습 통계에서 갖는 의미보다 구조 비용이 크다.
 */
export function splitByKstDate(
  startedAtISO: string,
  endedAtISO: string,
  totalMinutes: number,
): TimerSplitPart[] {
  const startDate = kstDate(startedAtISO);
  const endDate = kstDate(endedAtISO);
  if (totalMinutes <= 0) return [];
  if (startDate === endDate) {
    return [{ logDate: startDate, minutes: totalMinutes, startedAt: startedAtISO }];
  }

  const parts: TimerSplitPart[] = [];
  const spanMs = Date.parse(endedAtISO) - Date.parse(startedAtISO);
  let cursorISO = startedAtISO;
  let cursorDate = startDate;
  let assigned = 0;

  // 자정 경계를 하나씩 넘으며 잘라 나간다(하루를 통째로 넘기는 세션도 대응).
  while (cursorDate !== endDate) {
    const nextMidnightISO = kstDateTimeToISO(nextKstDate(cursorDate), "00:00");
    const chunkMs = Date.parse(nextMidnightISO) - Date.parse(cursorISO);
    const minutes = Math.round((totalMinutes * chunkMs) / spanMs);
    if (minutes > 0) {
      parts.push({ logDate: cursorDate, minutes, startedAt: cursorISO });
      assigned += minutes;
    }
    cursorISO = nextMidnightISO;
    cursorDate = nextKstDate(cursorDate);
  }

  const rest = totalMinutes - assigned;
  if (rest > 0) parts.push({ logDate: endDate, minutes: rest, startedAt: cursorISO });
  return parts;
}

function nextKstDate(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

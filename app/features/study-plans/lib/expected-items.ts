// Phase 3 Stage 3 — 기대 항목·달성률 파생 계산 (순수 함수, 서버·클라 공용).
// 일간 슬롯 테이블 없음 — 배치는 (기간 × 하루시간 × 요일범위)에서 파생한다.
// 평일/주말 판정: 달력 날짜(YYYY-MM-DD, KST 일 단위) 자체의 요일. 공휴일 미고려.

import type { DayScope } from "../labels";

export interface ExpectedItemInput {
  itemId: string;
  dayScope: DayScope;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dailyMinutes: number;
}

/** 달력 날짜의 주말 여부 — 토(6)·일(0). */
export function isWeekendDate(dateISO: string): boolean {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export function scopeMatches(scope: DayScope, weekend: boolean): boolean {
  return scope === "all" || (scope === "weekend") === weekend;
}

/** 특정 날짜 D의 기대 항목 — 일일 기록 화면의 선택지(P12). */
export function expectedItemsForDate<T extends ExpectedItemInput>(
  items: readonly T[],
  dateISO: string,
): T[] {
  const weekend = isWeekendDate(dateISO);
  return items.filter(
    (i) => i.startDate <= dateISO && dateISO <= i.endDate && scopeMatches(i.dayScope, weekend),
  );
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { addDaysISO };

/** [from, to] 구간에서 항목이 적용되는 일수. */
export function expectedDaysInRange(
  item: ExpectedItemInput,
  fromISO: string,
  toISO: string,
): number {
  const start = item.startDate > fromISO ? item.startDate : fromISO;
  const end = item.endDate < toISO ? item.endDate : toISO;
  if (end < start) return 0;
  let count = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    if (scopeMatches(item.dayScope, isWeekendDate(d))) count += 1;
  }
  return count;
}

export interface LogInput {
  logId: string;
  planItemId: string | null;
  nodeId: string | null;
  logDate: string;
  minutes: number; // 역방향 레코드는 음수 — 부호 합산으로 자연 상쇄
  completion: "full" | "partial" | "none";
  reversesLogId: string | null;
}

export interface ItemMetric {
  itemId: string;
  expectedDays: number;
  expectedMinutes: number;
  actualMinutes: number;
  fullDays: number;
  /** 실제/기대 분 (기대 0이면 null). */
  timeRatio: number | null;
}

export interface PlanMetrics {
  items: ItemMetric[];
  totalExpectedMinutes: number;
  totalActualMinutes: number; // 계획 외 포함(무필터 — E1)
  plannedActualMinutes: number; // 계획 항목 연결분
  unclassifiedMinutes: number; // node_id NULL (분석 격리 대상, 총 시간에는 포함)
  unclassifiedRatio: number | null;
}

// ── 월 캘린더 파생 (계획·기록 화면 공용) ─────────────────────────────────────
// 일간 슬롯 테이블 없음 — 날짜별 기대·달성은 전부 여기서 파생한다.

export type CalendarDayStatus =
  | "done" // 기대 항목 전부 완료 기록
  | "partial" // 일부만 기록 (부분 포함)
  | "missed" // 지난 날인데 기록 없음
  | "pending" // 오늘·미래 — 아직 기록 전
  | "free"; // 그날 기대 항목 없음

export interface CalendarDay {
  date: string;
  weekend: boolean;
  expectedCount: number;
  expectedMinutes: number;
  /** 부호 합산(취소 상쇄) — 계획 외 기록 포함. */
  loggedMinutes: number;
  fullCount: number;
  status: CalendarDayStatus;
}

export function buildCalendarDays(
  items: readonly ExpectedItemInput[],
  logs: readonly LogInput[],
  fromISO: string,
  toISO: string,
  todayISO: string,
): CalendarDay[] {
  const reversed = new Set(
    logs.map((l) => l.reversesLogId).filter((v): v is string => !!v),
  );
  const logsByDate = new Map<string, LogInput[]>();
  for (const l of logs) {
    const arr = logsByDate.get(l.logDate);
    if (arr) arr.push(l);
    else logsByDate.set(l.logDate, [l]);
  }
  const out: CalendarDay[] = [];
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) {
    const weekend = isWeekendDate(d);
    const expected = items.filter(
      (i) => i.startDate <= d && d <= i.endDate && scopeMatches(i.dayScope, weekend),
    );
    const dayLogs = logsByDate.get(d) ?? [];
    const loggedMinutes = dayLogs.reduce((s, l) => s + l.minutes, 0);
    const fullItems = new Set(
      dayLogs
        .filter(
          (l) =>
            l.minutes > 0 &&
            l.completion === "full" &&
            l.planItemId &&
            !reversed.has(l.logId),
        )
        .map((l) => l.planItemId as string),
    );
    const fullCount = expected.filter((i) => fullItems.has(i.itemId)).length;
    let status: CalendarDayStatus;
    if (expected.length === 0) status = "free";
    else if (fullCount === expected.length) status = "done";
    else if (loggedMinutes > 0) status = "partial";
    else if (d < todayISO) status = "missed";
    else status = "pending";
    out.push({
      date: d,
      weekend,
      expectedCount: expected.length,
      expectedMinutes: expected.reduce((s, i) => s + i.dailyMinutes, 0),
      loggedMinutes,
      fullCount,
      status,
    });
  }
  return out;
}

/** [from, to] 구간 지표 — 준수율·달성률·미분류 비율 (승인 2.2: 현재 승인본 기준). */
export function computePlanMetrics(
  items: readonly ExpectedItemInput[],
  logs: readonly LogInput[],
  fromISO: string,
  toISO: string,
): PlanMetrics {
  const inRange = logs.filter((l) => l.logDate >= fromISO && l.logDate <= toISO);

  // 항목별 실제 분 (부호 합산 — 취소 레코드 상쇄).
  const actualByItem = new Map<string, number>();
  // 항목별 full 일수 — 역방향에 뒤집힌 로그 제외.
  const reversed = new Set(
    inRange.map((l) => l.reversesLogId).filter((v): v is string => !!v),
  );
  const fullDaysByItem = new Map<string, Set<string>>();
  let totalActual = 0;
  let unclassified = 0;
  for (const l of inRange) {
    totalActual += l.minutes;
    if (!l.nodeId) unclassified += l.minutes;
    if (l.planItemId) {
      actualByItem.set(l.planItemId, (actualByItem.get(l.planItemId) ?? 0) + l.minutes);
      if (l.minutes > 0 && l.completion === "full" && !reversed.has(l.logId)) {
        const days = fullDaysByItem.get(l.planItemId) ?? new Set<string>();
        days.add(l.logDate);
        fullDaysByItem.set(l.planItemId, days);
      }
    }
  }

  const itemMetrics: ItemMetric[] = items.map((i) => {
    const expectedDays = expectedDaysInRange(i, fromISO, toISO);
    const expectedMinutes = expectedDays * i.dailyMinutes;
    const actualMinutes = actualByItem.get(i.itemId) ?? 0;
    return {
      itemId: i.itemId,
      expectedDays,
      expectedMinutes,
      actualMinutes,
      fullDays: fullDaysByItem.get(i.itemId)?.size ?? 0,
      timeRatio: expectedMinutes > 0 ? actualMinutes / expectedMinutes : null,
    };
  });

  const totalExpected = itemMetrics.reduce((s, m) => s + m.expectedMinutes, 0);
  const plannedActual = itemMetrics.reduce((s, m) => s + m.actualMinutes, 0);
  return {
    items: itemMetrics,
    totalExpectedMinutes: totalExpected,
    totalActualMinutes: totalActual,
    plannedActualMinutes: plannedActual,
    unclassifiedMinutes: unclassified,
    unclassifiedRatio: totalActual > 0 ? unclassified / totalActual : null,
  };
}

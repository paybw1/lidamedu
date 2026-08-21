// feat-7-048 — 공부 통계 순수 집계. DB 변경 없이 study_logs 배열만 받는다.
// 학생 화면과 상담 화면이 같은 함수를 쓴다(지표가 두 곳에서 갈라지지 않게).
//
// ★취소는 역방향 음수 레코드다 — 단순 합산이 곧 순증이다(따로 걸러내지 않는다).
import { addDaysISO } from "./expected-items";
import { heatLevel, subjectKey } from "../subject-axis";

export interface StatLog {
  logDate: string;
  minutes: number;
  subjectKind: string | null;
  subjectCode: string | null;
  startedAt?: string | null;
}

export interface DayCell {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface SubjectTotal {
  kind: string | null;
  code: string | null;
  minutes: number;
}

export function sumByDate(logs: StatLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(l.logDate, (m.get(l.logDate) ?? 0) + l.minutes);
  return m;
}

/** 기간 [from, to] 합계(분). */
export function totalIn(logs: StatLog[], from: string, to: string): number {
  return logs
    .filter((l) => l.logDate >= from && l.logDate <= to)
    .reduce((s, l) => s + l.minutes, 0);
}

/** 기간 [from, to] 의 과목별 합계 — 많은 순. 0 이하(전량 취소)는 뺀다. */
export function subjectTotalsIn(
  logs: StatLog[],
  from: string,
  to: string,
): SubjectTotal[] {
  const acc = new Map<string, SubjectTotal>();
  for (const l of logs) {
    if (l.logDate < from || l.logDate > to) continue;
    const key = subjectKey(l.subjectKind ?? "-", l.subjectCode ?? "-");
    const cur = acc.get(key) ?? {
      kind: l.subjectKind,
      code: l.subjectCode,
      minutes: 0,
    };
    cur.minutes += l.minutes;
    acc.set(key, cur);
  }
  return [...acc.values()]
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

/** 달력 격자 — 그 달을 감싸는 일요일~토요일 구간. */
export function buildHeatmapDays(
  logs: StatLog[],
  monthStart: string,
  monthEnd: string,
  todayISO: string,
): DayCell[] {
  const byDate = sumByDate(logs);
  const lead = new Date(`${monthStart}T00:00:00Z`).getUTCDay();
  const tail = 6 - new Date(`${monthEnd}T00:00:00Z`).getUTCDay();
  const from = addDaysISO(monthStart, -lead);
  const to = addDaysISO(monthEnd, tail);
  const out: DayCell[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const minutes = byDate.get(d) ?? 0;
    out.push({
      date: d,
      minutes,
      level: heatLevel(minutes),
      inMonth: d >= monthStart && d <= monthEnd,
      isToday: d === todayISO,
      isFuture: d > todayISO,
    });
  }
  return out;
}

/** 그 날짜가 속한 주(월~일). */
export function weekRangeOf(dateISO: string): { from: string; to: string } {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // 0=일
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const from = addDaysISO(dateISO, -backToMonday);
  return { from, to: addDaysISO(from, 6) };
}

export function monthRangeOf(dateISO: string): { from: string; to: string } {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${dateISO.slice(0, 8)}01`,
    to: `${dateISO.slice(0, 8)}${String(last).padStart(2, "0")}`,
  };
}

export type StatPeriod = "day" | "week" | "month";

export interface PeriodSummary {
  from: string;
  to: string;
  minutes: number;
  /** 직전 같은 길이 구간 대비 증감(분). 비교 구간에 기록이 전혀 없으면 null. */
  deltaMinutes: number | null;
  subjects: SubjectTotal[];
}

/** 일간/주간/월간 요약 — 직전 구간 대비 증감까지. */
export function summarize(
  logs: StatLog[],
  period: StatPeriod,
  anchorDate: string,
): PeriodSummary {
  const range =
    period === "day"
      ? { from: anchorDate, to: anchorDate }
      : period === "week"
        ? weekRangeOf(anchorDate)
        : monthRangeOf(anchorDate);

  const spanDays =
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) /
      86_400_000 +
    1;
  const prevTo = addDaysISO(range.from, -1);
  const prevFrom = addDaysISO(prevTo, -(spanDays - 1));
  const prevLogs = logs.filter((l) => l.logDate >= prevFrom && l.logDate <= prevTo);

  return {
    from: range.from,
    to: range.to,
    minutes: totalIn(logs, range.from, range.to),
    deltaMinutes:
      prevLogs.length === 0
        ? null
        : totalIn(logs, range.from, range.to) - totalIn(logs, prevFrom, prevTo),
    subjects: subjectTotalsIn(logs, range.from, range.to),
  };
}

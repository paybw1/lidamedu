// 현장강의 달력 계산(순수, 클라/서버 공용). day_label 의 요일마다 개강일 이후로 반복 표시.
//   TZ 버그 방지 위해 모든 날짜 연산은 UTC 기준(getUTCDay 등).

export interface CalendarSchedule {
  schedule_id: string;
  subject_label: string;
  title: string;
  instructor_name: string;
  start_date: string | null; // YYYY-MM-DD
  day_label: string | null; // "월·목"
  time_label: string | null;
  status: string;
}

const DOW: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

// "월·목" → [1,4]. 라벨 안의 요일 글자를 모두 수집.
export function parseWeekdays(label: string | null): number[] {
  if (!label) return [];
  const out = new Set<number>();
  for (const ch of label) {
    const n = DOW[ch];
    if (n !== undefined) out.add(n);
  }
  return [...out];
}

// "YYYY-MM" → {year, month0}. 유효하지 않으면 fallbackISO 기준.
export function parseYm(
  ym: string | null,
  fallbackISO: string,
): { year: number; month0: number } {
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : fallbackISO.slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  return { year: y, month0: mo - 1 };
}

export function ymString(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

export function addMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

// 달력 6주 매트릭스 — 각 칸은 그 달의 '일(day)' 또는 null(빈칸).
export function monthMatrix(year: number, month0: number): (number | null)[][] {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// day(1..31) → 그날 열리는 강의들. 반복 요일(개강일 이후) + 개강일 당일.
export function monthEvents(
  schedules: CalendarSchedule[],
  year: number,
  month0: number,
): Map<number, CalendarSchedule[]> {
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const map = new Map<number, CalendarSchedule[]>();
  const add = (d: number, s: CalendarSchedule) => {
    const arr = map.get(d) ?? [];
    arr.push(s);
    map.set(d, arr);
  };
  for (const s of schedules) {
    const wd = parseWeekdays(s.day_label);
    const startMs = s.start_date
      ? Date.parse(`${s.start_date}T00:00:00Z`)
      : null;
    for (let d = 1; d <= days; d++) {
      const cur = Date.UTC(year, month0, d);
      if (startMs !== null && cur < startMs) continue; // 개강 전
      const dow = new Date(cur).getUTCDay();
      const isStart = startMs !== null && cur === startMs;
      const meets = wd.length > 0 && wd.includes(dow);
      if (meets || isStart) add(d, s);
    }
  }
  return map;
}

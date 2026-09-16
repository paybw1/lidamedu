// feat-11-013 P7-b — 이용일수 계산의 순수부 (요청서 11-5).
//
// ★DB 접근 0. `calc.server.ts` 가 값을 모아 여기에 넘긴다.
//   이용일수는 시각이 아니라 **KST 달력일**로 센다 — 「접수일 − 시작일 + 1일」이 요청서 문면이고,
//   시각으로 세면 오전 결제·오후 접수가 0일이 되어 같은 날 신청이 1일로 안 잡힌다.

import { KST_OFFSET_MS } from "~/core/lib/kst";

/** KST 달력일(yyyy-mm-dd). */
export function kstDate(iso: string | number): string {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 두 KST 달력일 사이의 일수(같은 날이면 0). */
export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export interface PauseSpan {
  starts_on: string;
  ends_on: string;
  /** 조기 재개 시각. null 이면 끝까지 쉬었다. */
  resumed_at: string | null;
}

/**
 * 승인된 일시정지로 **실제로 멈춘 일수** — 계산 구간과 겹친 만큼만.
 *
 * ★`enrollment_pauses.days` 를 그대로 빼면 안 된다. 조기 재개는 `resumed_at` 만 찍고
 *   `days` 도 `expires_at` 도 되돌리지 않으므로(`pause.server.ts`), 쓰지도 않은 정지일이
 *   이용일수에서 빠져 **공제가 줄고 환불이 부푼다.** 실제 구간은
 *   `starts_on ~ min(ends_on, 재개일)` 이다.
 *
 * ★★**겹치는 구간을 합산하면 안 된다 — 날짜 합집합으로 센다.**
 *   일시정지는 `enrollment_pauses.enrollment_id` 로 **수강권 하나마다** 걸리는데,
 *   패키지 상품은 구성 강의 수만큼 수강권이 생긴다(`orders.server.ts` 의 `plan_courses` 루프).
 *   학생이 「내 강의실」에서 카드 3개를 각각 정지하면 같은 30일이 3건으로 들어오고,
 *   단순 합산하면 **90일**이 빠진다. 그러면 60일 쓴 학생의 이용일수가 0 이 되어
 *   공제가 사라지고 「7일 이내 전액환불」로까지 판정된다 — 학원이 통째로 손해를 본다.
 *   요청서 11-5 는 「승인된 일시정지 기간은 이용일수에서 제외」이지 「수강권 수만큼 제외」가 아니다.
 */
export function pausedDaysWithin(
  pauses: PauseSpan[],
  windowFrom: string,
  windowTo: string,
): number {
  const days = new Set();
  for (const p of pauses) {
    const resumedDate = p.resumed_at ? kstDate(p.resumed_at) : null;
    const end = resumedDate && resumedDate < p.ends_on ? resumedDate : p.ends_on;
    const from = p.starts_on > windowFrom ? p.starts_on : windowFrom;
    const to = end < windowTo ? end : windowTo;
    const span = daysBetween(from, to);
    if (span < 0) continue;
    const base = Date.parse(`${from}T00:00:00Z`);
    for (let i = 0; i <= span; i += 1) {
      days.add(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
    }
  }
  return days.size;
}

/**
 * 실제 이용일수 d (요청서 11-5).
 * 시작일 전이면 0. 승인된 일시정지는 제외한다. 음수는 0.
 *
 * ★`elapsedDays`(정지를 빼기 **전** 달력 일수)를 함께 돌려주는 이유 —
 *   요청서 11-3 의 「수강 시작일부터 7일 이내」는 **달력**이지 이용일수가 아니다.
 *   정지 제외분으로 판정하면 3개월 전에 산 학생이 중간에 일시정지를 걸어 두는 것만으로
 *   「7일 이내」가 되어 **전액환불 창이 무한정 열린다.** 공제(d)만 정지를 뺀 값을 쓴다.
 *
 * ★`notStarted`(이용 시작일이 기준일보다 뒤) — feat-11-013 P3-b 정규 유형의 개강 전 결제·
 *   연장 재구매(이용 시작 = 기존 만료일)는 접수 시점에 아직 시작 전이라 elapsedDays 가 0 이다.
 *   `elapsedDays > 0` 만으로 7일 창을 판정하면 「시작 전 접수」가 창 밖으로 떨어져 자동판정이
 *   사라지므로, 호출부가 이 플래그로 「이용 시작 전」을 따로 판정한다.
 */
export function usedDaysOf(input: {
  usageStartDate: string;
  basisDate: string;
  pauses: PauseSpan[];
}): { usedDays: number; pausedDays: number; elapsedDays: number; notStarted: boolean } {
  if (input.usageStartDate > input.basisDate) {
    return { usedDays: 0, pausedDays: 0, elapsedDays: 0, notStarted: true };
  }
  const raw = daysBetween(input.usageStartDate, input.basisDate) + 1;
  const pausedDays = pausedDaysWithin(input.pauses, input.usageStartDate, input.basisDate);
  return {
    usedDays: Math.max(0, raw - pausedDays),
    pausedDays,
    elapsedDays: raw,
    notStarted: false,
  };
}

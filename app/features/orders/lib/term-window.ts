// feat-11-013 P3-b — 정규 유형(고정 종료일 상품)의 수강 창 계산. 순수 함수(DB 접근 0).
//
// 소비처: orders.server(주문항목 스냅샷 duration_days_snapshot · fulfillCourseEnrollments 의 starts_at/expires_at).
// ★fixed_end_date 가 없는 일수 상품은 이 함수를 쓰지 않는다 — 현행 computeExpiry(now + duration_days) 그대로.
//
// 규칙(설계 §3.4 P3-b):
//   · 날짜는 KST — starts_on 은 00:00:00+09:00, fixed_end_date 는 23:59:59+09:00(현행 computeExpiry 와 동일).
//   · starts_on 이 있고 아직 안 왔으면 → 시작 = starts_on, 종료 = fixed_end(선구매, 중간 신청 아님).
//   · 그 밖(starts_on 없음 또는 경과) → 시작 = 지금.
//       mode fixed_days 이고 일수>0 → 종료 = 지금 + N일 (★상한 없음 — fixed_end 를 넘어도 그대로, 의도)
//       그 밖(until_end·null·closed) → 종료 = fixed_end (closed 는 결제 진입 4경로가 assertPlanSellable
//       (orders/plan-sellability.server)로 먼저 거절하므로 여기 오면 폴백)
//   · 시작일 없음 + fixed_days 는 계산상 「전원 결제+N일」이지만, admin-plan 이 중간 신청 모드 지정 시
//     starts_on 을 필수로 요구(400)하므로 신규 저장으로는 만들어지지 않는다.

import { KST_OFFSET_MS } from "~/core/lib/kst";
import type { MidEntryMode } from "~/features/lms/lib/course-format";

const DAY_MS = 86_400_000;

/** KST 달력일의 00:00:00+09:00 을 epoch ms 로. */
export function kstDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS;
}

/** KST 달력일의 23:59:59+09:00 을 epoch ms 로(현행 computeExpiry 의 `T23:59:59+09:00` 과 같은 값). */
export function kstDayEndMs(date: string): number {
  return Date.parse(`${date}T23:59:59Z`) - KST_OFFSET_MS;
}

export interface TermWindowInput {
  nowMs: number;
  /** plan_policies.starts_on (YYYY-MM-DD) — null 이면 지급 즉시. */
  startsOn: string | null;
  /** plan_policies.fixed_end_date (YYYY-MM-DD) — 이 함수는 값이 있을 때만 쓴다. */
  fixedEndDate: string;
  midEntryMode: MidEntryMode | null;
  midEntryDays: number | null;
}

export interface TermWindow {
  startsAtMs: number;
  endsAtMs: number;
  /** starts_on 이 있고 이미 지난 뒤의 결제인가(중간 신청). starts_on 이 없으면 false. */
  isMidEntry: boolean;
  /**
   * 종료일의 근거 — 스냅샷이 분기 조건을 다시 적지 않도록 여기서 정한다.
   *   fixed_end        → duration_days_snapshot 은 현행(정책 duration_days = null)
   *   mid_entry_days   → duration_days_snapshot = midEntryDays (정가 수강기간 D 가 N일로 바뀐다)
   */
  endsBasis: "fixed_end" | "mid_entry_days";
}

export function computeTermWindow(input: TermWindowInput): TermWindow {
  const fixedEndMs = kstDayEndMs(input.fixedEndDate);
  const startsOnMs = input.startsOn ? kstDayStartMs(input.startsOn) : null;

  if (startsOnMs != null && input.nowMs < startsOnMs) {
    return {
      startsAtMs: startsOnMs,
      endsAtMs: fixedEndMs,
      isMidEntry: false,
      endsBasis: "fixed_end",
    };
  }

  const isMidEntry = startsOnMs != null;
  const useDays =
    input.midEntryMode === "fixed_days" &&
    input.midEntryDays != null &&
    input.midEntryDays > 0;
  if (useDays) {
    return {
      startsAtMs: input.nowMs,
      endsAtMs: input.nowMs + (input.midEntryDays as number) * DAY_MS,
      isMidEntry,
      endsBasis: "mid_entry_days",
    };
  }
  return {
    startsAtMs: input.nowMs,
    endsAtMs: fixedEndMs,
    isMidEntry,
    endsBasis: "fixed_end",
  };
}

/** 중간 신청 불허 상품의 결제 거절 판정 — starts_on 00:00 KST 이후이고 mode 가 closed 일 때만 true. */
export function isMidEntryClosed(input: {
  nowMs: number;
  startsOn: string | null;
  midEntryMode: MidEntryMode | null;
}): boolean {
  if (input.midEntryMode !== "closed" || !input.startsOn) return false;
  return input.nowMs >= kstDayStartMs(input.startsOn);
}

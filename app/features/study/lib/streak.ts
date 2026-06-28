// feat-2-027 Phase 2 — 스트릭 순수 계산 (DB 비의존). ★가벼운 메커닉:
//  - 1차 프레이밍 "이번 주 N일"(주간 케이던스, 빠진 날 있어도 다른 날 카운트 = 비처벌).
//  - 현재 연속은 freeze 보호(단일 결석에 안 끊김) + 오늘 미완 시 어제부터 허용(관대).
// 날짜는 모두 KST "YYYY-MM-DD" 문자열 비교(호출부가 KST ymd 주입 — 순수 유지).

export interface DayActivity {
  date: string; // KST YYYY-MM-DD
  attemptCount: number;
}

/** ymd(KST) 가 속한 주의 월요일 ymd. (월요일 시작 주) */
export function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=일 ~ 6=토
  const fromMonday = (dow + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - fromMonday);
  return d.toISOString().slice(0, 10);
}

/** 이번 주(월~오늘, KST) 활동일 수. */
export function thisWeekActiveDays(days: DayActivity[], todayYmd: string): number {
  const monday = mondayOf(todayYmd);
  return days.filter(
    (d) => d.attemptCount > 0 && d.date >= monday && d.date <= todayYmd,
  ).length;
}

/**
 * freeze 보호 현재 연속 학습일. days = 오래된→최신 순(마지막 = 오늘).
 *  - 맨 끝(오늘) 1일이 비어 있으면 무료로 건너뜀(오늘 아직 안 함 → 어제부터).
 *  - 시작 후 빈 날은 freezes 한도 내에서 보호(연속 유지, 빈 날은 카운트 안 함).
 *  - freeze 소진 후 빈 날 만나면 종료.
 */
export function computeProtectedStreak(
  days: DayActivity[],
  freezes: number,
): number {
  let streak = 0;
  let budget = Math.max(0, freezes);
  let started = false;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const active = days[i].attemptCount > 0;
    if (active) {
      streak += 1;
      started = true;
      continue;
    }
    if (!started) {
      // 아직 활동일을 못 만남 = 맨 끝의 빈 날.
      if (i === days.length - 1) continue; // 오늘 미완 → 어제부터 허용
      return 0; // 어제도 비어 있음 → 연속 없음
    }
    // 시작 후 빈 날 → freeze 소비.
    if (budget > 0) {
      budget -= 1;
      continue;
    }
    break;
  }
  return streak;
}

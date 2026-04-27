import { addDays, isSameDay, isWeekend } from "date-fns";

/**
 * 한국 공휴일과 주말(토/일)을 모두 제외하고 영업일 기준으로 날짜를 계산합니다.
 *
 * @param startDate 시작 날짜
 * @param businessDaysToAdd 더할 영업일 수
 * @param holidays 제외할 공휴일 목록 (Date 객체 배열)
 * @returns 영업일을 기준으로 계산된 최종 날짜
 */
export function addBusinessDaysWithHolidays(
  startDate: Date,
  businessDaysToAdd: number,
  holidays: Date[],
): Date {
  let date = new Date(startDate);
  let added = 0;

  while (added < businessDaysToAdd) {
    date = addDays(date, 1);

    const isHoliday = holidays.some((h) => isSameDay(h, date));
    if (isWeekend(date) || isHoliday) {
      continue; // 주말 또는 공휴일은 패스
    }

    added++; // 유효한 영업일 1일 추가
  }

  return date;
}

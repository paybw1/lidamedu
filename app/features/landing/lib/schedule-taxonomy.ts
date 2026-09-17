// 강의 캘린더(현장강의 일정) 분류 SSOT — 구분(1차/2차) + 과목 7종.
// 원장 결정 2026-09-17: 형태 축(현장/실시간/영상)을 없앤 자리에 찾기 축 두 개를 넣는다.
//   · 구분 exam_round: round1=1차 / round2=2차 / NULL=「구분 없음」
//   · 과목 subject_code: LMS 과목 6(강의개설·도서 SSOT) + 「2차 선택」(elective2) —
//     elective2 는 일정·캘린더 전용 묶음이라 LMS_SUBJECT_CODES(도서·강의개설 CHECK)에는 넣지 않는다.
// DB: lecture_schedules.exam_round CHECK(NULL|round1|round2) · subject_code CHECK(7값)
//   — scripts/sql/20260917_schedule_exam_round.sql. 값을 늘리면 DB CHECK 부터.
// 클라이언트 번들(관리자 폼·캘린더 칩)에 들어가므로 .server 모듈을 import 하지 말 것.
import {
  LMS_SUBJECT_LABEL,
  LMS_SUBJECT_OPTIONS,
  isLmsSubjectCode,
} from "~/features/lms/lib/subject-options";

// ── 구분(1차/2차) ──
export const EXAM_ROUNDS = ["round1", "round2"] as const;
export type ExamRound = (typeof EXAM_ROUNDS)[number];

export const EXAM_ROUND_LABEL: Record<ExamRound, string> = {
  round1: "1차",
  round2: "2차",
};
/** exam_round 가 NULL 인 일정의 표시 라벨(필터 select 의 빈 옵션에도 같은 문구). */
export const EXAM_ROUND_NONE_LABEL = "구분 없음";

function isExamRound(v: unknown): v is ExamRound {
  return (
    typeof v === "string" && (EXAM_ROUNDS as readonly string[]).includes(v)
  );
}

/** 폼·쿼리스트링 값 → ExamRound. 빈값·모르는 값은 null(=구분 없음). */
export function toExamRound(v: string | null | undefined): ExamRound | null {
  return isExamRound(v) ? v : null;
}

/** 저장된 exam_round → 화면 라벨(NULL·모르는 값은 「구분 없음」). */
export function examRoundLabel(v: string | null | undefined): string {
  const r = toExamRound(v);
  return r ? EXAM_ROUND_LABEL[r] : EXAM_ROUND_NONE_LABEL;
}

// ── 과목 7종 ──
/** 「2차 선택」 — 일정·캘린더 전용 묶음(도서·강의개설 SSOT 에는 넣지 않는다). */
export const SCHEDULE_ELECTIVE_CODE = "elective2" as const;
const SCHEDULE_ELECTIVE_LABEL = "2차 선택";

/** select·칩 옵션 — 배열 순서가 곧 표시 순서(LMS 6과목 순서 + 2차 선택 끝). */
export const SCHEDULE_SUBJECT_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  ...LMS_SUBJECT_OPTIONS,
  { value: SCHEDULE_ELECTIVE_CODE, label: SCHEDULE_ELECTIVE_LABEL },
];

export function isScheduleSubjectCode(v: unknown): v is string {
  return v === SCHEDULE_ELECTIVE_CODE || isLmsSubjectCode(v);
}

/** 코드 → 과목 라벨(7값). 미지정·모르는 코드는 null. */
export function scheduleSubjectLabel(
  code: string | null | undefined,
): string | null {
  if (code === SCHEDULE_ELECTIVE_CODE) return SCHEDULE_ELECTIVE_LABEL;
  return isLmsSubjectCode(code) ? LMS_SUBJECT_LABEL[code] : null;
}

// ── 필터 술어(캘린더·테스트 공용) ──
export interface ScheduleFilter {
  round: "all" | ExamRound;
  subject: "all" | string;
}

/**
 * 구분·과목 두 축 모두 만족해야 true.
 * · round 'all' 이면 전부, 아니면 exam_round === round 인 것만 — NULL(구분 없음)은 'all' 에서만 보인다.
 * · subject 'all' 이면 전부, 아니면 subject_code === subject 인 것만 — NULL 도 'all' 에서만 보인다.
 */
export function matchesScheduleFilter(
  s: { exam_round: string | null; subject_code: string | null },
  f: ScheduleFilter,
): boolean {
  const roundOk = f.round === "all" || s.exam_round === f.round;
  const subjectOk = f.subject === "all" || s.subject_code === f.subject;
  return roundOk && subjectOk;
}

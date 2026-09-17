// 강의 캘린더 필터·카드 메타 규칙(순수, 클라/서버 공용) — 2026-09-17 원장 결정(구분·과목 찾기 축).
//   ① URL 파라미터(?round=round1&subject=patent, 기본 all) → 필터 값. 상태는 URL 이 SSOT.
//   ② 카드 메타 「1차 · 특허법」 — 구분(exam_round)은 있을 때만 앞에, 과목은 subject_code → 라벨,
//      없으면 운영자 입력 subject_label(구 데이터) 폴백. 캘린더 카드·달력 막대·홈 레일이 같은 규칙을 쓴다.
//   ③ 과목이 「2차 선택」이고 구분이 2차면 구분 낱말을 생략한다(「2차 · 2차 선택」 중복 방지).
//   분류 어휘(구분·과목 7종·matchesScheduleFilter)는 schedule-taxonomy.ts 가 SSOT. *.server 값 import 금지.
import {
  EXAM_ROUND_LABEL,
  type ExamRound,
  SCHEDULE_ELECTIVE_CODE,
  type ScheduleFilter,
  isScheduleSubjectCode,
  scheduleSubjectLabel,
  toExamRound,
} from "./schedule-taxonomy";

/** 「2차 선택」 과목의 모노그램 — 「2차」로 줄이면 구분 라벨과 구별되지 않는다. */
const ELECTIVE_MONOGRAM = "선택";

/** 구분 라벨을 앞에 붙일지 — 「2차 선택」+2차는 라벨에 이미 「2차」가 있어 생략. */
function showsRoundLabel(
  round: ExamRound | null,
  subjectCode: string | null,
): round is ExamRound {
  if (!round) return false;
  return !(round === "round2" && subjectCode === SCHEDULE_ELECTIVE_CODE);
}

// ── 필터(URL SSOT) ──────────────────────────────────────────────────────────
// 필터 값 타입·술어(matchesScheduleFilter)는 schedule-taxonomy 의 ScheduleFilter 그대로.
export const FILTER_ALL = "all" as const;
export const FILTER_PARAM_ROUND = "round";
export const FILTER_PARAM_SUBJECT = "subject";

/** URL 파라미터 → 필터. 모르는 값·없음은 전부 all. subject 는 SCHEDULE_SUBJECT_OPTIONS 7값만 통과. */
export function parseScheduleFilter(
  get: (key: string) => string | null,
): ScheduleFilter {
  const subjectRaw = get(FILTER_PARAM_SUBJECT);
  return {
    round: toExamRound(get(FILTER_PARAM_ROUND)) ?? FILTER_ALL,
    subject: isScheduleSubjectCode(subjectRaw) ? subjectRaw : FILTER_ALL,
  };
}

/** 빈 상태 문구용 「1차 특허법」. 전체면 "" (라벨 생략). */
export function scheduleFilterLabel(f: ScheduleFilter): string {
  const parts: string[] = [];
  const round = f.round === FILTER_ALL ? null : f.round;
  const subjectCode = f.subject === FILTER_ALL ? null : f.subject;
  if (showsRoundLabel(round, subjectCode)) parts.push(EXAM_ROUND_LABEL[round]);
  if (subjectCode) {
    const subject = scheduleSubjectLabel(subjectCode);
    if (subject) parts.push(subject);
  }
  return parts.join(" ");
}

// ── 카드 메타 ───────────────────────────────────────────────────────────────
export const SCHEDULE_META_SEP = " · ";

export interface ScheduleMetaSource {
  exam_round: string | null;
  subject_code: string | null;
  subject_label: string;
}

/** 과목 표시 문자열 — 코드 라벨 우선, 없으면 운영자 입력 라벨(구 데이터). */
export function scheduleSubjectText(
  s: Pick<ScheduleMetaSource, "subject_code" | "subject_label">,
): string {
  return scheduleSubjectLabel(s.subject_code) ?? s.subject_label;
}

/** 썸네일 모노그램 원문 — 「2차 선택」은 「선택」, 그 밖은 과목 표시 문자열. */
export function scheduleMonogramText(
  s: Pick<ScheduleMetaSource, "subject_code" | "subject_label">,
): string {
  return s.subject_code === SCHEDULE_ELECTIVE_CODE
    ? ELECTIVE_MONOGRAM
    : scheduleSubjectText(s);
}

/** ["1차", "특허법"] / 구분 없으면 ["특허법"] / 2차+「2차 선택」이면 ["2차 선택"]. 요일·시간을 뒤에 이어 붙이는 호출부용. */
export function scheduleMetaParts(s: ScheduleMetaSource): string[] {
  const round = toExamRound(s.exam_round);
  const subject = scheduleSubjectText(s);
  return showsRoundLabel(round, s.subject_code)
    ? [EXAM_ROUND_LABEL[round], subject]
    : [subject];
}

/** 「1차 · 특허법」 / 구분 없으면 「특허법」. */
export function scheduleMetaLabel(s: ScheduleMetaSource): string {
  return scheduleMetaParts(s).join(SCHEDULE_META_SEP);
}

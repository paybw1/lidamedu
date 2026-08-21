// Phase 3 — 진단·월간 계획 공용 타입·상수. 클라이언트/서버 양쪽 import 가능.
// (서버 전용 값을 여기 두지 말 것 — 빌드 함정: 서버모듈 클라 번들 유입)

export type AttemptType = "first" | "repeat";
export const ATTEMPT_TYPE_LABEL: Record<AttemptType, string> = {
  first: "초시",
  repeat: "재시",
};

export type SubjectKind = "law" | "science";

// subject_code 는 offline_tests CHECK 값 집합과 동일 (새 값 금지 — DB CHECK 동기).
export const PLAN_LAW_CODES = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
] as const;
export const PLAN_SCIENCE_CODES = [
  "physics",
  "chemistry",
  "biology",
  "earth_science",
] as const;

// ── 반 차수 — 화면에 뿌릴 법과목 목록이 여기서 파생된다(feat-7-048 D4) ─────────
// 값 이름은 개인 단위 차수(profiles.next_exam_round)와 맞춘다.
export type ExamRound = "first" | "second";
export const EXAM_ROUND_LABEL: Record<ExamRound, string> = {
  first: "1차",
  second: "2차",
};

/**
 * 계획·상담 화면에 노출할 법과목.
 * 1차는 민사소송법을 빼고, 2차는 민법 대신 민사소송법을 쓴다.
 * ★PLAN_LAW_CODES(=DB CHECK 집합의 미러)는 줄이지 않는다 — 화면 목록만 여기서 정한다.
 */
export function planLawCodesFor(
  examRound: ExamRound,
): readonly (typeof PLAN_LAW_CODES)[number][] {
  return examRound === "second"
    ? ["patent", "trademark", "design", "civil-procedure"]
    : ["patent", "trademark", "design", "civil"];
}

// ── 과목별 수준 ──────────────────────────────────────────────────────────────
// lecture_stage 는 basic_course_status 로 대체됐다(feat-7-048 D3). 컬럼·타입은
// 지난 상담 기록을 읽기 위해 남겨 두고, 새로 쓰지 않는다.
export type LectureStage = "none" | "basic" | "advanced" | "complete";
export const LECTURE_STAGE_LABEL: Record<LectureStage, string> = {
  none: "수강 전",
  basic: "기본강의",
  advanced: "심화강의",
  complete: "수강 완료",
};

export type BasicCourseStatus = "before" | "done" | "retake" | "not_needed";
export const BASIC_COURSE_STATUS_LABEL: Record<BasicCourseStatus, string> = {
  before: "수강 전",
  done: "수강 완료",
  retake: "재수강 필요",
  not_needed: "강의 필요 없음",
};
// 자연과학만 '강의 필요 없음'을 쓴다 — DB CHECK 는 합집합, 허용 집합은 여기가 SSOT.
export const BASIC_COURSE_STATUS_BY_KIND: Record<
  SubjectKind,
  readonly BasicCourseStatus[]
> = {
  law: ["before", "done", "retake"],
  science: ["before", "done", "retake", "not_needed"],
};

export type StudyDirection =
  | "advanced"
  | "objective"
  | "reading_problem"
  | "problem";
export const STUDY_DIRECTION_LABEL: Record<StudyDirection, string> = {
  advanced: "심화강의",
  objective: "객관식 강의",
  reading_problem: "회독+문제풀이",
  problem: "문제풀이",
};
export const STUDY_DIRECTION_BY_KIND: Record<
  SubjectKind,
  readonly StudyDirection[]
> = {
  law: ["advanced", "objective", "reading_problem"],
  science: ["advanced", "objective", "problem"],
};

export type ScienceTier = "high" | "mid" | "low";
export const SCIENCE_TIER_LABEL: Record<ScienceTier, string> = {
  high: "상",
  mid: "중",
  low: "하",
};

export type TierSource = "manual" | "diagnostic_test" | "diagnostic_retracted";
export const TIER_SOURCE_LABEL: Record<TierSource, string> = {
  manual: "수기",
  diagnostic_test: "진단 테스트",
  diagnostic_retracted: "진단 철회 — 재확인 필요",
};

// G3 — 자연과학 tier 경계 (승인 1-2: 정답률 비율 판정). 단일 정의 — 하드코딩 금지.
export const SCIENCE_TIER_HIGH_RATIO = 0.7;
export const SCIENCE_TIER_MID_RATIO = 0.4;

export function deriveScienceTier(score: number, total: number): ScienceTier {
  if (total <= 0) return "low";
  const ratio = score / total;
  if (ratio >= SCIENCE_TIER_HIGH_RATIO) return "high";
  if (ratio >= SCIENCE_TIER_MID_RATIO) return "mid";
  return "low";
}

export type PlanStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "revision_requested"
  | "superseded";
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "작성 중",
  submitted: "제출됨",
  approved: "승인됨",
  revision_requested: "보완 요청",
  superseded: "이전 버전",
};

export type PlanActivityType =
  | "lecture"
  | "review"
  | "problem"
  | "memorize"
  | "reading"
  | "essay"
  | "other";
export const PLAN_ACTIVITY_TYPES: PlanActivityType[] = [
  "lecture",
  "review",
  "problem",
  "memorize",
  "reading",
  "essay",
  "other",
];
export const PLAN_ACTIVITY_LABEL: Record<PlanActivityType, string> = {
  lecture: "강의 수강",
  review: "복습",
  problem: "문제 풀이",
  memorize: "암기",
  reading: "통독",
  essay: "답안 작성",
  other: "기타",
};

export type DayScope = "weekday" | "weekend" | "all";
export const DAY_SCOPE_LABEL: Record<DayScope, string> = {
  weekday: "평일",
  weekend: "주말",
  all: "매일",
};

// ── 과욕 지수 (승인 보조 신호 1) — 작성 화면 실시간 + 승인 화면 서버 공용 ────
export const OVERLOAD_WARN_RATIO = 1.0; // 이상이면 경고
export const OVERLOAD_CAUTION_RATIO = 0.9; // 이상이면 주의

export interface OverloadInput {
  dailyMinutes: number;
  dayScope: DayScope;
}

export interface OverloadIndex {
  weekdayPlanned: number;
  weekendPlanned: number;
  /** 분모(선언 가용시간)가 0/미입력이면 null — 신호 표시 안 함. */
  weekdayRatio: number | null;
  weekendRatio: number | null;
}

export function computeOverloadIndex(
  items: OverloadInput[],
  weekdayMinutes: number | null,
  weekendMinutes: number | null,
): OverloadIndex {
  let weekday = 0;
  let weekend = 0;
  for (const i of items) {
    if (i.dayScope === "weekday" || i.dayScope === "all") weekday += i.dailyMinutes;
    if (i.dayScope === "weekend" || i.dayScope === "all") weekend += i.dailyMinutes;
  }
  return {
    weekdayPlanned: weekday,
    weekendPlanned: weekend,
    weekdayRatio: weekdayMinutes && weekdayMinutes > 0 ? weekday / weekdayMinutes : null,
    weekendRatio: weekendMinutes && weekendMinutes > 0 ? weekend / weekendMinutes : null,
  };
}

export function overloadTone(ratio: number | null): "ok" | "caution" | "warn" | null {
  if (ratio === null) return null;
  if (ratio >= OVERLOAD_WARN_RATIO) return "warn";
  if (ratio >= OVERLOAD_CAUTION_RATIO) return "caution";
  return "ok";
}

// ── 시간 표기 (feat-7-048 D1) ────────────────────────────────────────────────
// DB 는 전 구간 '분' 정수로 저장한다(가용시간 CHECK 0~1440·과욕 지수 분모·기대 분).
// 시/분은 입력창과 화면 표시에서만 쓴다 — 여기가 표기 SSOT, `${n}분` 하드코딩 금지.
const MINUTES_PER_HOUR = 60;

/** 340 → "5시간 40분" · 300 → "5시간" · 40 → "40분" · 0 → "0분" (음수는 부호 보존) */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / MINUTES_PER_HOUR);
  const m = abs % MINUTES_PER_HOUR;
  if (h === 0) return `${sign}${m}분`;
  if (m === 0) return `${sign}${h}시간`;
  return `${sign}${h}시간 ${m}분`;
}

/** 340 → "5:40" — 달력 셀처럼 폭이 좁은 곳. */
export function formatMinutesCompact(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / MINUTES_PER_HOUR);
  const m = abs % MINUTES_PER_HOUR;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

/** 분 → 입력창용 {시간, 분}. */
export function splitMinutes(minutes: number | null | undefined): {
  hours: number | "";
  mins: number | "";
} {
  if (minutes == null) return { hours: "", mins: "" };
  const abs = Math.max(0, Math.round(minutes));
  return {
    hours: Math.floor(abs / MINUTES_PER_HOUR),
    mins: abs % MINUTES_PER_HOUR,
  };
}

/** 입력창 {시간, 분} → 분. 빈 칸은 0으로 본다. */
export function joinMinutes(
  hours: number | string | null,
  mins: number | string | null,
): number {
  const h = Number(hours) || 0;
  const m = Number(mins) || 0;
  return h * MINUTES_PER_HOUR + m;
}

// ── 월간 기간 (KST) ──────────────────────────────────────────────────────────
export function currentMonthPeriod(now: Date = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart: start, periodEnd: end };
}

// ── KST 시각 헬퍼 (feat-7-048) ───────────────────────────────────────────────

/** 오늘(KST) YYYY-MM-DD. */
export function todayKST(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 아직 오지 않은 날인가 — 미리 완료 처리 금지 판정(feat-7-048 D12). */
export function isFutureDate(dateISO: string, now: Date = new Date()): boolean {
  return dateISO > todayKST(now);
}

/** KST 날짜+시각("HH:MM") → UTC ISO 문자열. 저장은 timestamptz 다. */
export function kstDateTimeToISO(dateISO: string, timeHHMM: string): string {
  return new Date(`${dateISO}T${timeHHMM}:00+09:00`).toISOString();
}

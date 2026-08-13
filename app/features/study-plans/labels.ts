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

export type LectureStage = "none" | "basic" | "advanced" | "complete";
export const LECTURE_STAGE_LABEL: Record<LectureStage, string> = {
  none: "수강 전",
  basic: "기본강의",
  advanced: "심화강의",
  complete: "수강 완료",
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

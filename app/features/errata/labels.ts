// errata Phase 3 — 발행 모달 상수·판정 SSOT (서버·클라이언트 공용, 비-server 모듈).

export const ERRATA_KINDS = [
  { value: "typo", label: "정오" },
  { value: "law_amend", label: "법령개정" },
  { value: "precedent_change", label: "판례변경" },
  { value: "addendum", label: "추록" },
  { value: "answer_change", label: "정답정정" },
  { value: "deletion", label: "삭제" },
] as const;
export type ErrataKind = (typeof ERRATA_KINDS)[number]["value"];

export const ERRATA_SEVERITIES = [
  { value: "critical", label: "긴급" },
  { value: "normal", label: "보통" },
  { value: "minor", label: "경미" },
] as const;
export type ErrataSeverity = (typeof ERRATA_SEVERITIES)[number]["value"];

// 정답 관련 컬럼 — changed_fields 에 포함되면 재채점 체크를 제안한다 (지시서 §4.5).
export const ANSWER_FIELDS = [
  "is_correct",
  "ox_truth",
  "model_answer_md",
  "grading_rubric_md",
  "rubric_items",
] as const;

// 시험 적용 판정 (지시서 §4.3) — 확정 시험일(target_exam_date)만 판정에 쓴다.
// estimate 는 판정 금지(결정서 §7.1) — 미확정이면 unknown 으로 경고만.
export type ExamScope = "applicable" | "future" | "unknown";
export function examScope(
  effectiveDate: string | null,
  targetExamDate: string | null,
): ExamScope {
  if (!targetExamDate) return "unknown";
  if (!effectiveDate) return "applicable";
  return effectiveDate <= targetExamDate ? "applicable" : "future";
}

export const EXAM_SCOPE_LABEL: Record<ExamScope, string> = {
  applicable: "시험 적용",
  future: "시행 예정 · 이번 시험 미적용",
  unknown: "시험일 미확정 — 적용 여부 판정 불가",
};

// 진입 경로 기반 errata_kind 기본값 — change_kind 는 퀵에딧도 amended 로 찍혀
// 구분력이 없으므로(§10 후속확인), 어느 화면에서 왔는지가 더 정확한 신호다.
export const DEFAULT_KIND_BY_CONTEXT: Record<string, ErrataKind> = {
  article_quick_edit: "typo",
  law_revision_workspace: "law_amend",
  case_edit: "precedent_change",
  problem_edit: "typo",
};

// 추록·정오표 목록의 과목 탭 — publications.subject_code 와 1:1.
// 판본이 아직 없는 과목도 버튼은 항상 노출한다(빈 상태 안내).
export const ERRATA_SUBJECT_TABS = [
  { code: "patent", label: "특허법" },
  { code: "trademark", label: "상표법" },
  { code: "design", label: "디자인보호법" },
  { code: "civil", label: "민법" },
  { code: "civil_procedure", label: "민사소송법" },
  { code: "science", label: "자연과학" },
] as const;
export type ErrataSubjectCode = (typeof ERRATA_SUBJECT_TABS)[number]["code"];

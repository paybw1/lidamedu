import type { IssueAttemptShape, IssueExtractionPhase } from "./types";

/**
 * 응시 타임스탬프 기반 phase 추론. attempt 가 없으면 'blank'.
 * 컬럼 직접 비교가 아니라 헬퍼 통일 — GS·cases 양쪽 일관성 유지.
 */
export function determinePhase(
  attempt: IssueAttemptShape | null,
): IssueExtractionPhase {
  if (!attempt) return "blank";
  if (attempt.selfCheckedAt) return "self-checked";
  if (attempt.submittedAt) return "submitted";
  return "in-progress";
}

/** 자기채점 단계 = 모범 쟁점 reveal 허용. 그 전엔 노출 금지. */
export function canRevealModelIssues(phase: IssueExtractionPhase): boolean {
  return phase === "submitted" || phase === "self-checked";
}

/** done = 채점 완료. PDF 전문·관련 자료 노출 게이트. */
export function isDone(phase: IssueExtractionPhase): boolean {
  return phase === "self-checked";
}

import type { ConclusionAttemptShape } from "./types";

/** ③④ 결론·강약 attempt 의 phase 추론. */
export function determineConclusionPhase(
  attempt: ConclusionAttemptShape | null,
): IssueExtractionPhase {
  if (!attempt) return "blank";
  if (attempt.selfCheckedAt) return "self-checked";
  if (attempt.submittedAt) return "submitted";
  if (
    attempt.outlineMd ||
    (attempt.conclusions && Object.keys(attempt.conclusions).length > 0)
  )
    return "in-progress";
  return "blank";
}

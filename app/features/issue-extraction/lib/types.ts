// 공통 쟁점추출 모듈 — 도메인 중립 타입.
// 사용처: gs(논점추출) · cases(판례기반 쟁점추출). GS 는 현재 자체 타입을 쓰고
// 추후 이 모듈로 이전 예정. 신규 cases 부터 이 타입을 사용.

export type IssueExtractionPhase =
  | "blank"
  | "in-progress"
  | "submitted"
  | "self-checked";

export type IssueImportance = "core" | "side";

/** 모범 쟁점 — 채점 기준 행. 도메인 어느 쪽이든 동일 형태. */
export interface MasterIssue {
  issueId: string;
  label: string;
  descriptionMd: string | null;
  importance: IssueImportance;
  refHint: string | null;
}

/** 학생 자기채점 결과 — JSONB 컬럼에 저장되는 형태. */
export interface SelfCheck {
  hits: string[]; // issue_id[]
  missed: string[];
  wrong: string[]; // 자유 입력 (모범에 없는 자작 논점)
}

export interface AiAnalysisHit {
  issueId: string;
  evidence?: string;
}
export interface AiAnalysisMissed {
  issueId: string;
  severity: IssueImportance;
}
export interface AiAnalysisExtra {
  text: string;
  reason?: string;
}
export interface AiAnalysis {
  hits: AiAnalysisHit[];
  missed: AiAnalysisMissed[];
  extras: AiAnalysisExtra[];
}

/** Attempt — phase 추론용 timestamps + 학생 작성 + 채점 결과. */
export interface IssueAttemptShape {
  studentIssuesMd: string;
  submittedAt: string | null;
  selfCheckedAt: string | null;
  selfCheck: SelfCheck | null;
  aiAnalysis: AiAnalysis | null;
}

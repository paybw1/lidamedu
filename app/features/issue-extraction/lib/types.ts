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

// ============================================================================
// ③ 결론도출 + ④ 응용목차 훈련용 타입 (별도 트랙).
// ============================================================================

/** 학생 강약 표시 — A안 3단계. */
export type IssueEmphasis = "strong" | "medium" | "weak";

/** 학생이 한 쟁점에 적은 결론. */
export interface StudentConclusion {
  direction: string; // 자유 텍스트 — "인정"/"부정"/"성립"/"불성립" 등
  rationaleMd?: string; // 짧은 근거(선택)
}
export type ConclusionsMap = Record<string, StudentConclusion>;
export type EmphasisMap = Record<string, IssueEmphasis>;

/** 모범 쟁점 + ③④ 채점 기준. weight·결론은 선택. */
export interface MasterIssueWithConclusion extends MasterIssue {
  weight: number | null; // 0~100. NULL 이면 core/side 만으로 강약 판정.
  modelConclusionDirection: string | null;
  modelConclusionMd: string | null;
}

/** ③ 결론 매칭 결과 (issueId → 매치 상태). */
export type ConclusionMatch = "match" | "partial" | "wrong" | "skip";
/** ④ 강약 매칭 결과 (issueId → 권장 대비). */
export type EmphasisMatch = "aligned" | "under" | "over";

export interface ConclusionSelfCheck {
  conclusionMatches: Record<string, ConclusionMatch>;
  emphasisMatches: Record<string, EmphasisMatch>;
}

/** AI 강약 코칭 — 단정 X, 코칭 톤. */
export interface ConclusionCoachingNote {
  issueId: string | null; // null = 전체 종합
  kind: "emphasis" | "conclusion" | "overall";
  note: string;
}
export interface ConclusionAiAnalysis {
  notes: ConclusionCoachingNote[];
}

export interface ConclusionAttemptShape {
  outlineMd: string;
  conclusions: ConclusionsMap | null;
  emphasisMap: EmphasisMap | null;
  submittedAt: string | null;
  selfCheckedAt: string | null;
  selfCheck: ConclusionSelfCheck | null;
  aiAnalysis: ConclusionAiAnalysis | null;
}

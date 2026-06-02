// 공통 쟁점추출 모듈 — barrel export.
// 사용: import { WriteStage, SelfCheckStage, DoneStage, determinePhase, ... } from "~/features/issue-extraction";

export { WriteStage } from "./components/write-stage";
export { SelfCheckStage } from "./components/self-check-stage";
export { DoneStage } from "./components/done-stage";
export { Stat } from "./components/stat";
// ③④ 결론·강약 흐름.
export { ConclusionWriteStage } from "./components/conclusion-write-stage";
export { ConclusionSelfCheckStage } from "./components/conclusion-self-check-stage";
export { ConclusionDoneStage } from "./components/conclusion-done-stage";

export {
  determinePhase,
  determineConclusionPhase,
  canRevealModelIssues,
  isDone,
} from "./lib/phase";
export { computeIssueStats, type IssueStats } from "./lib/scoring";
export {
  recommendedEmphasis,
  compareEmphasis,
  compareConclusion,
  scoreConclusionAttempt,
  type ConclusionScoringResult,
} from "./lib/conclusion-scoring";
export type {
  IssueExtractionPhase,
  IssueImportance,
  MasterIssue,
  SelfCheck,
  AiAnalysis,
  AiAnalysisHit,
  AiAnalysisMissed,
  AiAnalysisExtra,
  IssueAttemptShape,
  IssueEmphasis,
  StudentConclusion,
  ConclusionsMap,
  EmphasisMap,
  MasterIssueWithConclusion,
  ConclusionMatch,
  EmphasisMatch,
  ConclusionSelfCheck,
  ConclusionAiAnalysis,
  ConclusionCoachingNote,
  ConclusionAttemptShape,
} from "./lib/types";

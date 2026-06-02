// 공통 쟁점추출 모듈 — barrel export.
// 사용: import { WriteStage, SelfCheckStage, DoneStage, determinePhase, ... } from "~/features/issue-extraction";

export { WriteStage } from "./components/write-stage";
export { SelfCheckStage } from "./components/self-check-stage";
export { DoneStage } from "./components/done-stage";
export { Stat } from "./components/stat";

export { determinePhase, canRevealModelIssues, isDone } from "./lib/phase";
export { computeIssueStats, type IssueStats } from "./lib/scoring";
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
} from "./lib/types";

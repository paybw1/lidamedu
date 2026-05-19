// mcq-exams 클라이언트·서버 공용 타입 — 다과목 통합 1차 모의고사 (feat-10-005).
// queries.server 와 분리해 클라이언트 번들에 import 가능.

import type {
  McqPackKind,
  McqPackSubjectScope,
} from "~/features/mcq-packs/labels";

// 시험 = 여러 교시(mcq_packs) 묶음.
export interface McqExamItem {
  examId: string;
  title: string;
  description: string | null;
  year: number | null;
  examRoundNo: number | null;
  /** 전 과목 평균 합격선 (정답률 %). */
  passAverage: number;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  paperCount: number;
}

// 시험의 한 교시 — mcq_pack 한 개.
export interface McqExamPaper {
  examId: string;
  packId: string;
  /** 교시 순서 (0 = 1교시). */
  ord: number;
  /** 과락선 (정답률 %). */
  failFloor: number;
  packTitle: string;
  subjectScope: McqPackSubjectScope;
  kind: McqPackKind;
  durationMin: number | null;
  problemCount: number;
}

// 러너에서 한 교시의 응시 상태.
export type ExamPaperStatus =
  | "completed"
  | "in_progress"
  | "available"
  | "locked";

export interface ExamRunnerPaper {
  paper: McqExamPaper;
  status: ExamPaperStatus;
  /** 진행 중/완료된 교시 세션 id. */
  sessionId: string | null;
}

export interface ExamAttemptInfo {
  attemptId: string;
  examId: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ExamRunnerData {
  exam: McqExamItem;
  papers: ExamRunnerPaper[];
  /** 사용자의 최신 응시 (없으면 null). */
  attempt: ExamAttemptInfo | null;
}

// 한 교시의 채점 결과.
export interface ExamPaperScore {
  packId: string;
  ord: number;
  packTitle: string;
  subjectScope: McqPackSubjectScope;
  failFloor: number;
  sessionId: string;
  correct: number;
  total: number;
  /** 정답률 % (소수 1자리). */
  score: number;
  /** score < failFloor — 과락. */
  belowFloor: boolean;
}

// 한 응시의 교시별 점수 + 합격 판정.
export interface ExamAttemptBreakdown {
  attemptId: string;
  examId: string;
  examTitle: string;
  passAverage: number;
  completedAt: string | null;
  papers: ExamPaperScore[];
  /** 전 교시 평균 (소수 1자리). */
  average: number;
  /** 한 교시라도 과락. */
  hasFloorFail: boolean;
  /** average ≥ passAverage 그리고 과락 없음. papers 비었으면 null. */
  passed: boolean | null;
}

// 등수 RPC 결과 — 호출자의 최신 완료 응시 기준.
export interface ExamAttemptRanking {
  attemptId: string;
  average: number;
  rank: number;
  totalTakers: number;
  percentile: number;
  zScore: number;
}

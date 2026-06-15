// feat-8-001 합격 데이터 도메인 라벨/타입.
// 클라/서버 양쪽 import 안전 (DB·service-role 의존 없음).

export type ExamRound = "first" | "second";
export type ExamResultStatus = "absent" | "pending" | "failed" | "passed";
export type ExamVerificationStatus =
  | "self_reported"
  | "document_submitted"
  | "verified"
  | "rejected";

export const EXAM_ROUND_LABEL: Record<ExamRound, string> = {
  first: "1차",
  second: "2차",
};

export const EXAM_ROUNDS: ExamRound[] = ["first", "second"];

export const EXAM_RESULT_STATUS_LABEL: Record<ExamResultStatus, string> = {
  absent: "응시 안 함",
  pending: "결과 대기",
  failed: "불합격",
  passed: "합격",
};

export const EXAM_RESULT_STATUSES: ExamResultStatus[] = [
  "passed",
  "failed",
  "pending",
  "absent",
];

export const EXAM_VERIFICATION_STATUS_LABEL: Record<
  ExamVerificationStatus,
  string
> = {
  self_reported: "자가 신고",
  document_submitted: "증빙 제출",
  verified: "인증됨",
  rejected: "반려",
};

export interface ExamResultRow {
  resultId: string;
  userId: string;
  examYear: number;
  examRound: ExamRound;
  status: ExamResultStatus;
  selfReportedTotalScore: number | null;
  selfReportedSubjectScores: Record<string, number> | null;
  verificationStatus: ExamVerificationStatus;
  certificateUrl: string | null;
  certificatePath: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  studySummaryMd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamProfileFields {
  // 현행(전환기 병행) — feat-8-026b A/B 분리 완료 후 제거 예정.
  analyticsConsentAt: string | null;
  // A: 내 데이터로 내 분석 / B: 풀 기여↔비교 열람(대칭). null=미동의.
  myAnalysisConsentAt: string | null;
  poolConsentAt: string | null;
  nextExamYear: number | null;
  nextExamRound: ExamRound | null;
}

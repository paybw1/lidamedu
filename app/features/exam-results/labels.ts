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

export const SCIENCE_SUBJECT_LABEL: Record<string, string> = {
  physics: "물리",
  chemistry: "화학",
  biology: "생물",
  earth_science: "지구과학",
};

export const SCIENCE_SUBJECT_KEYS = [
  "physics",
  "chemistry",
  "biology",
  "earth_science",
] as const;

export interface ExamResultRow {
  resultId: string;
  userId: string;
  examYear: number;
  examRound: ExamRound;
  status: ExamResultStatus;
  selfReportedTotalScore: number | null;
  selfReportedSubjectScores: Record<string, number> | null;
  selectedScienceSubject: string | null;
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
  analyticsConsentAt: string | null;
  nextExamYear: number | null;
  nextExamRound: ExamRound | null;
  selectedScienceSubject: string | null;
}

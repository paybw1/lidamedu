// 과제 도메인 타입 + 라벨 (feat-7-021).

export type AssignmentItemKind =
  | "article_read"
  | "case_read"
  | "problem"
  | "blank_set"
  | "recitation";

export const ASSIGNMENT_ITEM_KINDS: AssignmentItemKind[] = [
  "article_read",
  "case_read",
  "problem",
  "blank_set",
  "recitation",
];

export const ASSIGNMENT_ITEM_KIND_LABEL: Record<AssignmentItemKind, string> = {
  article_read: "조문 학습",
  case_read: "판례 학습",
  problem: "객관식 문제",
  blank_set: "빈칸 세트",
  recitation: "조문 암기",
};

export type AssignmentStatus = "pending" | "partial" | "completed";

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  pending: "미시작",
  partial: "진행",
  completed: "완수",
};

// feat-7-021b ④ — 과제별 마감 정책. 셋 다 학습은 무차단, recompute 완료 판정에서만 분기.
export type DeadlinePolicy = "recommended" | "late_allowed" | "strict";

export const DEADLINE_POLICY_LABEL: Record<DeadlinePolicy, string> = {
  recommended: "권장형 — 마감 후에도 완료 인정",
  late_allowed: "지각 인정형 — 완료 인정 + 지각 표시",
  strict: "마감형 — 마감 후 완료 불인정(학습은 가능)",
};

export interface AssignmentListItem {
  assignmentId: string;
  cohortId: string;
  title: string;
  descriptionMd: string | null;
  assignedAt: string;
  dueAt: string;
  createdBy: string;
  sourceCurriculumId: string | null;
  sourceWeekId: string | null;
  itemCount: number;
  deadlinePolicy: DeadlinePolicy;
  // 운영자 화면용 — 멤버 완수율
  totalMembers?: number;
  completedMembers?: number;
}

export interface AssignmentItem {
  itemId: string;
  ord: number;
  kind: AssignmentItemKind;
  articleId: string | null;
  articleLabel: string | null;
  caseId: string | null;
  caseTitle: string | null;
  problemId: string | null;
  problemSnippet: string | null;
  blankSetId: string | null;
  blankSetLabel: string | null;
  blankSetTotalBlanks: number | null;
  // 학생이 해당 항목을 학습하러 들어갈 URL (없으면 null — 진입 불가)
  entryUrl: string | null;
  targetQuantity: number | null;
  note: string | null;
  // ⑥ 항목별 완료 — getStudentAssignment 가 recompute 의 doneByItem 으로 채운다.
  // getAssignmentWithItems(운영자 화면 등)에서는 미설정(undefined).
  done?: boolean;
}

export interface AssignmentDetail extends AssignmentListItem {
  items: AssignmentItem[];
}

export interface AssignmentSubmission {
  submissionId: string;
  assignmentId: string;
  userId: string;
  status: AssignmentStatus;
  completedItems: number;
  totalItems: number;
  completedAt: string | null;
  lastCheckedAt: string;
}

// 학생 화면 — 본인 과제 + submission 상태
export interface StudentAssignmentRow extends AssignmentListItem {
  submission: AssignmentSubmission | null;
}

// 운영자 진척 화면 — 학생별 row
export interface MemberAssignmentProgress {
  profileId: string;
  name: string;
  email: string | null;
  status: AssignmentStatus;
  completedItems: number;
  totalItems: number;
  completedAt: string | null;
}

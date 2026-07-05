// 월간 개인 성적표 — 클라이언트 안전 타입·월 계산 헬퍼.
// (집계 로직은 monthly-report.server.ts — 컴포넌트에서 서버 모듈 값 참조 금지)

import type { AttendanceStatus } from "~/features/attendance/labels";

const KST_OFFSET_MS = 9 * 3600_000;

export interface MonthlySubjectStat {
  label: string;
  attempts: number;
  correct: number;
  accuracyPct: number;
}

export interface MonthlyWeakNode {
  lawName: string;
  nodeLabel: string;
  attempts: number;
  correct: number;
  accuracyPct: number;
}

export interface MonthlyAttendanceRow {
  sessionNo: number;
  heldOn: string;
  title: string | null;
  status: AttendanceStatus | null;
}

export interface MonthlyTestRow {
  title: string;
  roundNo: number | null;
  score: number;
  maxScore: number | null;
  pct: number | null;
  rank: number;
  taken: number;
  avgPct: number | null;
}

export interface MonthlyAssignmentRow {
  title: string;
  dueAt: string;
  personal: boolean;
  completedItems: number;
  totalItems: number;
  completed: boolean;
}

export interface MonthlyStudentReport {
  profileId: string;
  name: string | null;
  study: {
    attempts: number;
    correct: number;
    accuracyPct: number | null;
    studyDays: number;
    /** 전월 대비 — 비교 문구용. */
    prevAttempts: number;
    prevAccuracyPct: number | null;
    bySubject: MonthlySubjectStat[];
  };
  attendance: MonthlyAttendanceRow[];
  tests: MonthlyTestRow[];
  assignments: MonthlyAssignmentRow[];
  weakNodes: MonthlyWeakNode[];
}

export interface MonthlyReportData {
  month: string; // YYYY-MM
  monthLabel: string; // YYYY년 M월
  students: MonthlyStudentReport[];
}

export function parseMonthParam(raw: string | null): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  // 기본값 = 이번 달(KST).
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

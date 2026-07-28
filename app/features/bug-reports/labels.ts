// 클라이언트·서버 공용 타입/상수 (server-only 모듈에서 분리 — 클라 번들 안전).
export const BUG_REPORT_STATUSES = ["open", "in_progress", "done"] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export interface BugReportRow {
  reportId: string;
  reporterId: string | null;
  reporterName: string | null;
  url: string;
  message: string;
  userAgent: string | null;
  status: BugReportStatus;
  createdAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

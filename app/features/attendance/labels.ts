// feat-7-043 — 출결 공용 타입·라벨. 클라이언트/서버 양쪽 import 가능.

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "online",
  "excused",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
  online: "온라인",
  excused: "공결",
};

// 상태 chip 톤 — 결석만 로즈, 지각 앰버, 온라인 스카이, 공결 중립.
export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  late: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  absent: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
  online: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400",
  excused: "bg-muted text-muted-foreground",
};

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  online: number;
  excused: number;
}

export const EMPTY_ATTENDANCE_COUNTS: AttendanceCounts = {
  present: 0,
  late: 0,
  absent: 0,
  online: 0,
  excused: 0,
};

// 출석률 — 결석만 감점 (지각·온라인 대체·공결은 출석 인정, 병행반 정책).
// 분모 = 기록된 회차 수. 미기록 회차는 계산에서 제외.
export function attendanceRatePct(c: AttendanceCounts): number | null {
  const total = c.present + c.late + c.absent + c.online + c.excused;
  if (total === 0) return null;
  return Math.round(((total - c.absent) / total) * 100);
}

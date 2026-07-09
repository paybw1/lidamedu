// feat-12 강의 플랫폼 랜딩 — 공용 타입·라벨 (client-safe, 서버 import 안전).
import type { Database } from "database.types";

export type ScheduleRow = Database["public"]["Tables"]["lecture_schedules"]["Row"];
export type NewsRow = Database["public"]["Tables"]["lecture_news"]["Row"];
export type BannerRow = Database["public"]["Tables"]["landing_banners"]["Row"];

// ── 현장강의 일정 ──
export type LectureFormat = "offline" | "live" | "video";
export const FORMAT_LABEL: Record<LectureFormat, string> = {
  offline: "현장",
  live: "실시간",
  video: "영상",
};
export type ScheduleStatus = "open" | "soon" | "waitlist" | "closed";
export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  open: "접수중",
  soon: "임박",
  waitlist: "대기접수",
  closed: "마감",
};

// ── 리담소식 ──
export type NewsKind = "notice" | "event" | "passer";
export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  notice: "공지",
  event: "이벤트",
  passer: "합격속보",
};

// ── 배너 ──
export type BannerKind = "schedule" | "promo" | "passer" | "custom";
export const BANNER_KIND_LABEL: Record<BannerKind, string> = {
  schedule: "일정형(개강 임박 카드)",
  promo: "프로모션(대형 숫자)",
  passer: "합격속보(배지)",
  custom: "일반(텍스트만)",
};
export type BannerAccent = "gilt" | "blue" | "green";
export const BANNER_ACCENT_LABEL: Record<BannerAccent, string> = {
  gilt: "금박",
  blue: "블루",
  green: "그린",
};

// 잔여석 = capacity - enrolled (음수 방지).
export function remainingSeats(row: {
  capacity: number;
  enrolled: number;
}): number {
  return Math.max(0, row.capacity - row.enrolled);
}
// 정원 대비 신청 비율(게이지, 0~100).
export function fillPercent(row: {
  capacity: number;
  enrolled: number;
}): number {
  if (row.capacity <= 0) return 0;
  return Math.min(100, Math.round((row.enrolled / row.capacity) * 100));
}
// 개강일까지 남은 일수(D-day). null=날짜 없음. 음수(지난 개강)는 null 취급.
export function ddayFrom(startDate: string | null, todayISO: string): number | null {
  if (!startDate) return null;
  const start = Date.parse(startDate + "T00:00:00+09:00");
  const today = Date.parse(todayISO.slice(0, 10) + "T00:00:00+09:00");
  if (Number.isNaN(start) || Number.isNaN(today)) return null;
  const d = Math.round((start - today) / 86400000);
  return d < 0 ? null : d;
}

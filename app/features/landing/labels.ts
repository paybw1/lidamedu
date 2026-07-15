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

// 종류는 운영자 자유 입력 — 알려진 코드는 한글 라벨로, 자유 입력은 그대로 표시.
export function newsKindLabel(kind: string): string {
  return NEWS_KIND_LABEL[kind as NewsKind] ?? kind;
}
// 칩 색상 클래스 — 알려진 종류만 색, 자유 입력은 기본(공지 색).
export function newsKindChipClass(kind: string): string {
  if (kind === "notice" || kind === "event" || kind === "passer") return kind;
  if (kind === "공지") return "notice";
  if (kind === "이벤트") return "event";
  if (kind === "합격속보") return "passer";
  return "notice";
}

// ── 배너 ──
export type BannerKind = "schedule" | "promo" | "passer" | "custom";
export const BANNER_KIND_LABEL: Record<BannerKind, string> = {
  schedule: "일정형(개강 임박 카드)",
  promo: "프로모션(대형 숫자)",
  passer: "합격속보(배지)",
  custom: "일반(텍스트만)",
};
// HTML 배너에 <script> 가 있으면 iframe(srcdoc)으로 렌더해야 실행됨(innerHTML 은 스크립트
//   미실행). 스크립트 없는 배너는 기존대로 인라인 렌더(페이지 스타일 상속).
export function htmlHasScript(html: string | null | undefined): boolean {
  return !!html && /<script[\s>]/i.test(html);
}

// 스크립트 HTML 배너 iframe 오토핏 — 내용 높이에 맞춰 iframe 높이 조정 + 스크롤바 제거.
//   srcdoc + allow-same-origin 이라 부모에서 contentDocument 접근 가능. onLoad 에서 호출.
//   지연 렌더(폰트·스크립트·애니메이션)에 대비해 ResizeObserver + 지연 재측정.
export function fitBannerFrame(frame: HTMLIFrameElement): void {
  const apply = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const de = doc.documentElement;
    const body = doc.body;
    // 기본 body margin(8px)이 가로 스크롤을 유발 — 제거하고 가로 넘침 숨김.
    de.style.margin = "0";
    de.style.overflowX = "hidden";
    if (body) {
      body.style.margin = "0";
      body.style.overflowX = "hidden";
    }
    const h = Math.max(body ? body.scrollHeight : 0, de.scrollHeight);
    if (h > 0) frame.style.height = `${h}px`;
  };
  apply();
  const doc = frame.contentDocument;
  if (doc && doc.body && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(apply).observe(doc.body);
  }
  // 로드 직후 스크립트가 렌더하는 경우를 위해 몇 차례 더 측정.
  [150, 500, 1200].forEach((t) => setTimeout(apply, t));
}

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

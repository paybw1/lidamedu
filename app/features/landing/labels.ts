// feat-12 강의 플랫폼 랜딩 — 공용 타입·라벨 (client-safe, 서버 import 안전).
import type { Database } from "database.types";

export type ScheduleRow = Database["public"]["Tables"]["lecture_schedules"]["Row"];
export type NewsRow = Database["public"]["Tables"]["lecture_news"]["Row"];
export type BannerRow = Database["public"]["Tables"]["landing_banners"]["Row"];
export type LectureVideoRow =
  Database["public"]["Tables"]["lecture_videos"]["Row"];

// ── 강의 홈 짧은 영상(공부방법·맛보기) feat-12-002 ──
export type LectureVideoCategory = "study_method" | "teaser" | "etc";
export type LectureVideoProvider = "youtube" | "kollus";

export const LECTURE_VIDEO_CATEGORY_LABEL: Record<
  LectureVideoCategory,
  string
> = {
  study_method: "공부방법",
  teaser: "맛보기 강의",
  etc: "기타",
};
// 홈 노출 순서(카테고리 그룹).
export const LECTURE_VIDEO_CATEGORY_ORDER: LectureVideoCategory[] = [
  "study_method",
  "teaser",
  "etc",
];

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

// 스크립트 HTML 배너 iframe 오토핏 — 내용을 iframe 폭에 맞춰 자동 축소(가로) + 높이 자동(세로),
//   스크롤바 없음. srcdoc + allow-same-origin 이라 부모에서 contentDocument 접근 가능.
//   지연 렌더(폰트·스크립트·애니메이션)·창 크기 변경에 대비해 ResizeObserver + resize + 지연 재측정.
export function fitBannerFrame(frame: HTMLIFrameElement): void {
  const apply = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const de = doc.documentElement;
    const body = doc.body;
    if (!body) return;
    // 기본 margin 제거(가로 스크롤 유발). 자연 크기 측정 위해 변형·오버플로 리셋.
    de.style.margin = "0";
    body.style.margin = "0";
    body.style.transformOrigin = "top left";
    body.style.transform = "none";
    de.style.overflow = "visible";
    // 콘텐츠 자연 폭이 iframe 폭보다 넓으면 그 비율로 축소(확대는 안 함).
    const contentW = Math.max(body.scrollWidth, de.scrollWidth);
    const frameW = frame.clientWidth || contentW;
    const scale = contentW > frameW && contentW > 0 ? frameW / contentW : 1;
    body.style.transform = scale < 1 ? `scale(${scale})` : "none";
    // 높이 = 자연 높이 × 축소비율(변형은 scrollHeight 에 영향 없음). 넘침은 숨겨 스크롤 제거.
    const contentH = Math.max(body.scrollHeight, de.scrollHeight);
    de.style.overflow = "hidden";
    const h = Math.ceil(contentH * scale);
    if (h > 0) frame.style.height = `${h}px`;
  };
  apply();
  const doc = frame.contentDocument;
  if (doc && doc.body && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(apply).observe(doc.body);
  }
  // 창 크기 변경 시 iframe 폭이 바뀌므로 축소비율 재계산.
  if (typeof window !== "undefined") window.addEventListener("resize", apply);
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

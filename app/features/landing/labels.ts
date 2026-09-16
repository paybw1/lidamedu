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
  gilt: "기본(청)",
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

// ── 현장강의 마감 판정 (feat-11-012 P3) ────────────────────────────────────
// ★종전에는 세 화면이 제각각 판정했고 **셋 다 start_date 를 보지 않았다** — 이미 개강한
//   강의가 "접수중 · 잔여 12"로 남아 신청 가능한 듯 보였다(D-day 배지만 조용히 사라진다).
//   판정을 여기 하나로 모으고 개강일 경과를 넣는다.
//
// 우선순위: 운영자가 건 마감 > 개강일 경과 > 대기접수 > 잔여석 0 > 임박 > 접수중
//   ★"대기접수"는 자리가 없어도 접수를 받는 상태이므로 잔여석 0 보다 앞에 둔다.
//   ★중도 합류를 허용하는 반은 운영자가 상태를 waitlist 로 두면 계속 노출된다.
export interface ScheduleState {
  code: ScheduleStatus;
  /** 화면에 그대로 쓰는 라벨(임박은 "D-3 임박"). */
  label: string;
  closed: boolean;
  /** 개강까지 남은 날. 개강일이 지났거나 미정이면 null. */
  dday: number | null;
  seatsLeft: number;
  /** 개강일이 지났는가(미정이면 false). */
  started: boolean;
}

export function scheduleState(
  row: {
    status: string;
    start_date: string | null;
    capacity: number;
    enrolled: number;
  },
  todayISO: string,
): ScheduleState {
  const dday = ddayFrom(row.start_date, todayISO);
  const seatsLeft = remainingSeats(row);
  const started = !!row.start_date && dday === null;

  let code: ScheduleStatus;
  if (row.status === "closed") code = "closed";
  else if (started) code = "closed";
  else if (row.status === "waitlist") code = "waitlist";
  else if (seatsLeft === 0) code = "closed";
  else if (row.status === "soon") code = "soon";
  else code = "open";

  const label =
    code === "soon" && dday !== null
      ? `D-${dday} 임박`
      : (STATUS_LABEL[code] ?? STATUS_LABEL.open);

  return { code, label, closed: code === "closed", dday, seatsLeft, started };
}

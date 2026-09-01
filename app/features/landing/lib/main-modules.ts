// feat-11-009 — 메인화면 모듈 SSOT (요청서_0901 §2).
//
// ★이 파일은 client-safe 다. `.server` 를 import 하지 않는다 —
//   화면·관리 폼·서버 액션이 같은 정의를 쓰는데, 값을 `.server` 에서 끌어오면
//   typecheck 는 통과해도 `npm run build` 가 깨진다(메모: build-server-in-client).
//
// 모듈 종류는 두 갈래다.
//   ① 요청서가 명시한 7종 — 운영자가 내용까지 설정한다.
//   ② 붙박이(builtin_*) — 지금 손으로 디자인해 둔 섹션들. 순서·노출·기간·기기만 조절한다.
//      내용은 각자 소유 화면에서 관리한다(소식=/admin/lecture-news, 일정=/admin/lecture-schedules …).
//      ★붙박이를 둔 이유: "모듈이 있으면 모듈, 없으면 기존 화면" 식으로 갈면 배너 하나만
//        추가해도 나머지 메인화면이 통째로 사라진다. 기존 섹션도 모듈로 만들어 현행 순서
//        그대로 시드하면 첫날 화면이 그대로이고, 그 다음부터 자유롭게 조립할 수 있다.

import { z } from "zod";

export const MAIN_MODULE_DEVICES = ["all", "pc", "mobile"] as const;
export type MainModuleDevice = (typeof MAIN_MODULE_DEVICES)[number];

export const DEVICE_LABEL: Record<MainModuleDevice, string> = {
  all: "전체",
  pc: "PC만",
  mobile: "모바일만",
};

/** device → 래퍼 클래스. 서버에서 User-Agent 로 가르지 않는다(CDN 캐시가 두 벌 필요해진다). */
export const DEVICE_CLASS: Record<MainModuleDevice, string> = {
  all: "",
  pc: "hidden lg:block",
  mobile: "lg:hidden",
};

export const MAIN_MODULE_KINDS = [
  // ── ① 요청서 7종 ──────────────────────────────────────────────────────
  { kind: "hero_banner", label: "메인배너", configurable: true },
  { kind: "lecture_list", label: "강의진열", configurable: true },
  { kind: "board_recent", label: "공지사항 / 게시판", configurable: true },
  { kind: "youtube", label: "유튜브 영상", configurable: true },
  { kind: "book_list", label: "도서상품 진열", configurable: true },
  { kind: "bar_banner", label: "바배너", configurable: true },
  { kind: "free_html", label: "일반페이지 영역", configurable: true },
  // ── ② 붙박이(기존 섹션) ───────────────────────────────────────────────
  { kind: "builtin_video", label: "공부방법 · 맛보기 영상", configurable: false },
  { kind: "builtin_news", label: "리담소식(현행 디자인)", configurable: false },
  { kind: "builtin_schedule", label: "현장강의 일정", configurable: false },
  { kind: "builtin_curriculum", label: "수강신청 3단", configurable: false },
  { kind: "builtin_books", label: "리담 교재(현행 디자인)", configurable: false },
  { kind: "builtin_instructors", label: "전임 강사진", configurable: false },
  { kind: "builtin_reviews", label: "수강생 후기", configurable: false },
  { kind: "builtin_passers", label: "합격 수기", configurable: false },
  { kind: "builtin_faq", label: "자주 묻는 질문", configurable: false },
  { kind: "builtin_final", label: "최종 CTA · 오시는 길", configurable: false },
] as const;

export type MainModuleKind = (typeof MAIN_MODULE_KINDS)[number]["kind"];

const KIND_SET = new Set<string>(MAIN_MODULE_KINDS.map((k) => k.kind));

export const KIND_LABEL: Record<MainModuleKind, string> = Object.fromEntries(
  MAIN_MODULE_KINDS.map((k) => [k.kind, k.label]),
) as Record<MainModuleKind, string>;

export function isMainModuleKind(v: unknown): v is MainModuleKind {
  return typeof v === "string" && KIND_SET.has(v);
}

export function isConfigurable(kind: MainModuleKind): boolean {
  return MAIN_MODULE_KINDS.find((k) => k.kind === kind)?.configurable ?? false;
}

// ── kind 별 config 스키마 ────────────────────────────────────────────────
// 전부 기본값을 갖는다 — 빈 config({}) 로 만든 모듈도 바로 렌더된다.

/** 배너 자체(이미지·링크·노출기간)는 /admin/banners 가 소유한다. 여기선 어느 단을 놓을지만. */
export const heroBannerConfigSchema = z.object({
  tier: z.coerce.number().int().min(1).max(3).default(1),
});

export const lectureListConfigSchema = z.object({
  eyebrow: z.string().default("수강신청"),
  heading: z.string().default("지금 신청할 수 있는 강의"),
  /** subscription_plans.plan_id. 순서 = 진열 순서. 비우면 노출하지 않는다. */
  planIds: z.array(z.string().uuid()).default([]),
  moreHref: z.string().default("/lecture/catalog"),
});

/**
 * 게시판 = 강의 플랫폼의 공개 게시판인 **리담소식(lecture_news)**.
 * source 는 그 안의 분류다 — all(전체) / notice(공지) / event(이벤트) / passer(합격속보).
 * ★사내 공지(announcements)는 수신자별 개인 인박스라 공개 메인화면에 걸 수 없다.
 */
export const boardRecentConfigSchema = z.object({
  eyebrow: z.string().default("리담소식"),
  heading: z.string().default("공지 · 이벤트"),
  source: z.enum(["all", "notice", "event", "passer"]).default("all"),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  moreHref: z.string().default("/lecture/news"),
});

export const BOARD_SOURCE_LABEL: Record<
  z.infer<typeof boardRecentConfigSchema>["source"],
  string
> = {
  all: "전체",
  notice: "공지",
  event: "이벤트",
  passer: "합격속보",
};

export const youtubeConfigSchema = z.object({
  eyebrow: z.string().default("영상"),
  heading: z.string().default("리담 영상"),
  /** YouTube URL 또는 11자 ID. 순서대로 노출. */
  urls: z.array(z.string()).default([]),
});

export const bookListConfigSchema = z.object({
  eyebrow: z.string().default("리담 교재"),
  heading: z.string().default("강의와 하나로 설계된 교재"),
  /** 비우면 판매중 도서 최신순 6권. */
  bookIds: z.array(z.string().uuid()).default([]),
  moreHref: z.string().default("/lecture/books"),
});

export const barBannerConfigSchema = z.object({
  imagePc: z.string().default(""),
  imageMobile: z.string().default(""),
  href: z.string().default(""),
  alt: z.string().default(""),
});

export const freeHtmlConfigSchema = z.object({
  /** 운영자(staff) 작성 HTML — RichHtml 로 렌더한다(script·style 포함 가능). */
  html: z.string().default(""),
});

/** 유튜브 URL/ID → 영상 ID. 잘못된 입력은 null. */
export function youtubeId(input: string): string | null {
  const m =
    /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(input) ??
    /^([\w-]{11})$/.exec(input.trim());
  return m ? m[1] : null;
}

export function parseDevice(v: unknown): MainModuleDevice {
  return v === "pc" || v === "mobile" ? v : "all";
}

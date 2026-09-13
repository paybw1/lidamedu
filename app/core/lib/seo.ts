// 검색 노출 공용 메타 (feat-11-012 P1).
//
// ★React Router 7 은 하위 화면의 meta 가 부모 것을 **대체**한다 — root 에 canonical 을
//   심어도 화면으로 전파되지 않고, LinksFunction 은 인자가 없어 경로별 canonical 을 만들
//   수 없다. 그래서 "제목·설명·공유 미리보기·정본"을 한 번에 낼 수 있는 자리는 이 헬퍼뿐이다.
// ★부분 적용은 반쪽 열림이다 — 어떤 화면엔 canonical 이 있고 어떤 화면엔 없으면 중복
//   콘텐츠 판정이 반만 해결된다. 공개 화면은 전부 이 헬퍼를 쓴다.
// ★정본 호스트는 platforms.ts 의 CANONICAL_ORIGIN 한 곳 — 환경변수가 아니다(meta 는
//   화면 전환 중에도 실행돼 process.env 를 읽을 수 없다).

import type { MetaDescriptor } from "react-router";

import { CANONICAL_ORIGIN } from "./platforms";

export const SITE_NAME = "리담변리사학원";

// 공유 미리보기 기본 이미지.
// ★전용 대표 이미지(1200×630)는 아직 없다 — 원장 자산 대기(feat-11-012 §4-6).
//   그때까지 로고로 대신한다. 비율이 맞지 않아 카드에서 잘릴 수 있다.
const DEFAULT_OG_IMAGE = "/lidam-logo.png";

/** 끝 슬래시를 떼고 반드시 "/" 로 시작시킨다 — 같은 화면이 두 주소를 갖지 않게. */
export function normalizePath(pathname: string): string {
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withSlash === "/") return "/";
  return withSlash.replace(/\/+$/, "") || "/";
}

/** 경로 → 정본 절대주소. ★CANONICAL_ORIGIN 은 끝 슬래시가 없어야 한다(이중 슬래시 방지). */
export function canonicalUrl(pathname: string): string {
  return `${CANONICAL_ORIGIN.replace(/\/+$/, "")}${normalizePath(pathname)}`;
}

/** 이미 절대주소면 그대로, 경로면 정본 호스트를 붙인다. */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : canonicalUrl(pathOrUrl);
}

export interface PageMetaInput {
  /** 화면 제목. "리담변리사학원" 이 들어 있지 않으면 뒤에 붙인다. */
  title: string;
  /** 검색 결과에 그대로 실리는 한 문장. 화면마다 달라야 한다. */
  description: string;
  /** 공유 미리보기 이미지(절대주소 또는 "/" 로 시작하는 경로). */
  image?: string | null;
}

/**
 * 화면 하나의 메타 한 벌.
 *
 * 사용법: `export const meta: Route.MetaFunction = (a) => pageMeta({ ... }, a);`
 * (두 번째 인자는 meta 함수가 받는 인자 그대로 — location.pathname 만 쓴다.)
 */
export function pageMeta(
  input: PageMetaInput,
  args: { location: { pathname: string } },
): MetaDescriptor[] {
  const title = input.title.includes(SITE_NAME)
    ? input.title
    : `${input.title} | ${SITE_NAME}`;
  const url = canonicalUrl(args.location.pathname);
  const image = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE);
  return [
    { title },
    { name: "description", content: input.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: url },
  ];
}

/**
 * 본문에서 검색 결과용 설명 한 줄을 뽑는다.
 * 마크다운 기호·HTML 태그·줄바꿈을 걷어내고 길이를 자른다.
 * ★빈 문자열이 나올 수 있다 — 호출부가 기본 문구로 대체할 것.
 */
export function excerpt(text: string | null | undefined, max = 150): string {
  if (!text) return "";
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크 → 글자만
    .replace(/<[^>]+>/g, " ") // HTML 태그
    .replace(/[#*_`>~|]/g, " ") // 마크다운 기호
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max - 1).trimEnd() + "…";
}

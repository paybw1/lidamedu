// /robots.txt — 크롤러에게 "어디는 긁지 말라"를 알린다 (feat-11-012 P1).
//
// ★Sitemap 줄이 환경변수 끝 슬래시 때문에 `...com//sitemap.xml` 로 나가고 있었다(2026-09-13 실측).
//   정본 호스트는 CANONICAL_ORIGIN 한 곳만 본다.
// ★게이트를 열면 로그인 뒤 화면들이 전부 크롤 대상이 된다 — 크롤러가 받는 것은 내용이 아니라
//   로그인 리다이렉트뿐이라 색인 품질만 떨어진다. 그래서 로그인 필요 경로를 여기서 막는다.
// ★막지 **않는** 것: /lecture/home · /lecture/catalog · /lecture/books · /lecture/schedule ·
//   /lecture/news · /lecture/exam-info · /lecture/facilities · /about · /location
//   (= PUBLIC_LECTURE_PATHS. 이 목록과 아래 Disallow 는 서로 겹치면 안 된다.)
import { CANONICAL_ORIGIN } from "~/core/lib/platforms";

/** 로그인·권한이 필요해 색인할 값이 없는 경로. */
const DISALLOW = [
  // 운영·시스템
  "/admin",
  "/api",
  "/inbox",
  // 계정·가입 흐름
  "/login",
  "/join",
  "/logout",
  "/account",
  "/settings",
  "/consent",
  "/onboarding",
  "/pending-approval",
  // 학습 플랫폼(로그인 전용)
  "/dashboard",
  "/me",
  "/subjects",
  "/study",
  "/srs",
  "/qna",
  "/gs",
  "/community",
  "/payments",
  // 강의 플랫폼 — 구매·마이페이지·강의실
  "/lecture/cart",
  "/lecture/orders",
  "/lecture/payments",
  "/lecture/certificates",
  "/lecture/coupons",
  "/lecture/points",
  "/lecture/wishlist",
  "/lecture/settlements",
  "/lecture/support",
  "/lecture/announcements",
  "/lecture/room",
  "/lecture/watch",
];

export async function loader() {
  const body = [
    "User-agent: *",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "Allow: /",
    "",
    `Sitemap: ${CANONICAL_ORIGIN.replace(/\/+$/, "")}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}

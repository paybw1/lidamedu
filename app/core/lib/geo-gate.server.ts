// 국가 접근 게이트 — 한국 외 IP 의 문서 요청을 차단한다.
//
// Vercel 이 모든 요청에 붙이는 x-vercel-ip-country 헤더를 검사한다.
// 헤더가 없는 환경(로컬 개발, 자체 호스팅)은 통과 — 차단은 Vercel 배포에서만 동작.
// resource route(/api/cron 등)는 root loader 를 거치지 않으므로 이 게이트의 영향을
// 받지 않는다 — Vercel Cron·결제 웹훅이 해외 IP 라도 끊기지 않는다.
//
// 호출처: app/root.tsx loader. 차단 시 403 + code 를 던지고 root ErrorBoundary 가
// 전용 안내 화면을 렌더한다.

import { data } from "react-router";

import { GEO_BLOCKED_CODE } from "./geo-gate";

const ALLOWED_COUNTRIES = ["KR"] as const;

// 검색엔진·링크 미리보기 크롤러는 해외/데이터센터 IP 에서 오므로 UA 로 예외.
// 차단하면 구글·네이버 검색 색인과 카카오톡 링크 미리보기가 전부 소실된다.
// UA 는 위조 가능하지만 이 게이트는 접근 마찰용이지 보안 경계가 아니다 —
// 실제 보호는 인증 + 접근 승인 게이트(requireAccessApproval)가 담당.
// ★google-inspectiontool 은 Search Console 의 "URL 검사" 가 쓰는 UA 다. 빠져 있으면
//   해외 데이터센터에서 오는 그 요청이 403 이 되어 **색인 요청·실시간 테스트가 전부 실패**한다
//   (검색 노출을 최우선에 놓는 P1 에서 이게 막히면 확인할 방법이 없다).
// ★UA 는 위조 가능하다 — 이 게이트는 접근 마찰용이지 보안 경계가 아니다(위 주석 참조).
//   예외를 넓힌 만큼 해외 차단의 실효는 준다.
const CRAWLER_UA =
  /googlebot|google-inspectiontool|googleother|adsbot-google|bingbot|yeti|naverbot|daum|kakaotalk-scrap|facebookexternalhit|twitterbot|applebot/i;

export function requireAllowedCountry(request: Request): void {
  if (process.env.GEO_GATE === "off") return; // 긴급 해제 스위치
  const country = request.headers.get("x-vercel-ip-country");
  if (!country) return; // 헤더 없는 환경(로컬 등) 통과
  if ((ALLOWED_COUNTRIES as readonly string[]).includes(country)) return;
  if (CRAWLER_UA.test(request.headers.get("user-agent") ?? "")) return;
  throw data({ code: GEO_BLOCKED_CODE }, { status: 403 });
}

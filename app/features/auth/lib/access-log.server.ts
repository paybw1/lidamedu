// 접속(로그인) 이력 기록 — 카카오 OAuth 완주 시 1행. /admin/access-logs 에서 열람.
// UA 파싱은 표시용 간이 분류(라이브러리 비의존) — 정밀 분석 용도 아님.

import adminClient from "~/core/lib/supa-admin-client.server";

export function parseUserAgent(ua: string): {
  client: "PC" | "모바일";
  browser: string;
  device: string;
} {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  let browser = "기타";
  if (/KAKAOTALK/i.test(ua)) browser = "카카오톡 인앱";
  else if (/Whale\//.test(ua)) browser = "웨일";
  else if (/SamsungBrowser\//.test(ua)) browser = "삼성 인터넷";
  else if (/Edg\//.test(ua)) browser = "엣지";
  else if (/OPR\/|Opera/.test(ua)) browser = "오페라";
  else if (/Firefox\//.test(ua)) browser = "파이어폭스";
  else if (/Chrome\//.test(ua)) browser = "크롬";
  else if (/Safari\//.test(ua)) browser = "사파리";
  let device = "기타";
  if (/Windows NT/.test(ua)) device = "Windows";
  else if (/iPhone|iPad|iPod/.test(ua)) device = "iOS";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Macintosh|Mac OS X/.test(ua)) device = "macOS";
  else if (/Linux/.test(ua)) device = "Linux";
  return { client: isMobile ? "모바일" : "PC", browser, device };
}

export function clientIpOf(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/** 로그인 접속 기록 — 실패해도 로그인 흐름은 막지 않는다. */
export async function recordLoginAccess(
  userId: string,
  request: Request,
): Promise<void> {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    const { client, browser, device } = parseUserAgent(ua);
    await adminClient.from("user_access_logs").insert({
      user_id: userId,
      kind: "login",
      client,
      browser,
      device,
      ip: clientIpOf(request),
    });
  } catch {
    // 기록 실패는 무시 — 로그인 자체를 막지 않음.
  }
}

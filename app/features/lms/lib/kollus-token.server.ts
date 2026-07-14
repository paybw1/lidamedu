// Kollus 웹플레이어 재생 토큰 — 서버 전용(HS256 서명, 무의존성 node:crypto).
//
// 방식(공식 웹토큰 재생): security_key 로 HS256 서명한 JWT 를 만들어
//   https://v.kr.kollus.com/s?jwt=<JWT>&custom_key=<custom_key>&autoplay 로 임베드.
// JWT payload(공식 PHP 샘플 KollusPlayerCall.php 기준):
//   { mc: [ { mckey: <미디어콘텐츠키> } ], cuid: <클라이언트 사용자 ID>, expt: <만료 unix초> }
//   - mc     : 재생할 미디어 목록(각 항목의 mckey = lesson_videos.drm_video_id)
//   - cuid   : 시청자 식별(우리 학생 user id) — Kollus 통계/이력 매칭
//   - expt   : 이 재생 URL 유효 만료(unix seconds)
// 참고: https://docs.kollus.com/dev-guide/vod/quickstart/key/ (인증·키)
//        https://github.com/kollus-service/kollus-play-video-php (웹토큰 샘플)
//
// 키(비밀값)는 Vercel 환경변수로만 주입 — 코드/번들 노출 금지:
//   KOLLUS_SECURITY_KEY  : JWT 서명 비밀(보안 키)
//   KOLLUS_CUSTOM_KEY    : 재생 URL 파라미터(사용자 키)
//   KOLLUS_PLAYER_HOST   : (선택) 기본 https://v.kr.kollus.com, 전용 도메인 시 override
import { createHmac } from "node:crypto";

function b64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const DEFAULT_HOST = "https://v.kr.kollus.com";

/**
 * mckey(미디어 콘텐츠 키)로 Kollus 웹플레이어 재생 URL 생성.
 * env 키가 없거나 mckey 가 비면 null(=아직 재생 설정 전) — 호출부에서 안내 처리.
 */
export function buildKollusWebTokenUrl(opts: {
  mckey: string;
  cuid: string;
  expireSeconds: number;
}): string | null {
  const securityKey = process.env.KOLLUS_SECURITY_KEY;
  const customKey = process.env.KOLLUS_CUSTOM_KEY;
  if (!securityKey || !customKey || !opts.mckey) return null;

  const host = (process.env.KOLLUS_PLAYER_HOST || DEFAULT_HOST).replace(
    /\/+$/,
    "",
  );
  const header = b64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        mc: [{ mckey: opts.mckey }],
        cuid: opts.cuid,
        expt: Math.floor(Date.now() / 1000) + opts.expireSeconds,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const sig = b64url(
    createHmac("sha256", securityKey).update(signingInput).digest(),
  );
  const jwt = `${signingInput}.${sig}`;
  return `${host}/s?jwt=${encodeURIComponent(jwt)}&custom_key=${encodeURIComponent(
    customKey,
  )}&autoplay`;
}

/** Kollus 연동 키가 서버에 설정돼 있는지(재생 가능 여부 사전 안내용). */
export function isKollusConfigured(): boolean {
  return Boolean(
    process.env.KOLLUS_SECURITY_KEY && process.env.KOLLUS_CUSTOM_KEY,
  );
}

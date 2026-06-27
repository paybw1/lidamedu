/**
 * 단일 세션 강제(중복 로그인 차단) — feat-000-016.
 *
 * 한 계정당 "현재 유효 세션 ID"(`profiles.active_session_id`) 1개만 두고, 새 로그인이
 * 이를 갈아치운다(last-login-wins). 브라우저는 자기 세션 ID 를 httpOnly 쿠키
 * (`lidam_sid`)로 들고 다니며, 매 요청에서 쿠키 sid 와 DB active_session_id 를 비교해
 * 불일치(=다른 곳에서 더 새 로그인 발생)면 이 기기를 로그아웃시킨다.
 *
 * - 강제 대상: 학생(student)만. instructor/manager/admin 은 다기기 작업이 정상이라 면제.
 * - active_session_id 는 서버 생성 UUID(추측 불가) — 클라이언트로 내려보내지 않는다.
 * - 쓰기는 SECURITY DEFINER RPC(claim_session/release_session)로만(자기 행 auth.uid() 한정).
 * - 토큰 무상태 한계(만료 전 유효)에 기대지 않고, 매 요청 서버 권위 비교로 즉시 차단.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { createCookie, redirect } from "react-router";
import { randomUUID } from "node:crypto";

const SESSION_COOKIE_NAME = "lidam_sid";
// 400일 — Supabase 세션 지속과 동급으로 길게(브라우저 재시작에도 sid 유지 → 불필요 재로그인 방지).
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
// 선택적 HMAC 서명 — SESSION_COOKIE_SECRET 설정 시 서명, 없으면 미서명(보안은 추측불가 UUID 에 의존).
const cookieSecret = process.env.SESSION_COOKIE_SECRET;

/** lidam_sid — 이 브라우저의 현재 세션 ID. httpOnly(클라 JS 접근 차단), prod 에서만 secure. */
export const sessionIdCookie = createCookie(SESSION_COOKIE_NAME, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: COOKIE_MAX_AGE,
  secrets: cookieSecret ? [cookieSecret] : undefined,
});

/** 요청의 User-Agent 로 기기 라벨 생성(감사/표시용). 예 "Chrome · Windows". */
export function deviceLabelFrom(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua)
      ? "Mac"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "기타 OS";
  const browser = /KAKAOTALK/i.test(ua)
    ? "카카오톡"
    : /Edg\//i.test(ua)
      ? "Edge"
      : /OPR\/|Opera/i.test(ua)
        ? "Opera"
        : /SamsungBrowser/i.test(ua)
          ? "삼성인터넷"
          : /Firefox\//i.test(ua)
            ? "Firefox"
            : /Chrome\//i.test(ua)
              ? "Chrome"
              : /Safari\//i.test(ua)
                ? "Safari"
                : "브라우저";
  return `${browser} · ${os}`;
}

/** 현재 요청 쿠키에서 이 브라우저의 세션 ID 를 읽는다. */
export async function readSessionId(request: Request): Promise<string | null> {
  const raw: unknown = await sessionIdCookie.parse(
    request.headers.get("Cookie"),
  );
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * 이 로그인을 현재 유효 세션으로 등록(이전 기기 자동 무효화)하고,
 * `lidam_sid` Set-Cookie 를 headers 에 추가한다. 로그인 콜백(complete)에서 호출.
 */
export async function claimSession(
  client: SupabaseClient<Database>,
  request: Request,
  headers: Headers,
): Promise<void> {
  const sid = randomUUID();
  const { error } = await client.rpc("claim_session", {
    p_sid: sid,
    p_device: deviceLabelFrom(request),
  });
  if (error) throw error;
  headers.append("Set-Cookie", await sessionIdCookie.serialize(sid));
}

/** 현재 세션 해제(로그아웃) — DB active_session_id 비우고 쿠키 만료. signOut 전에 호출. */
export async function releaseSession(
  client: SupabaseClient<Database>,
  headers: Headers,
): Promise<void> {
  await client.rpc("release_session");
  headers.append(
    "Set-Cookie",
    await sessionIdCookie.serialize("", { maxAge: 0 }),
  );
}

/**
 * 이 브라우저 세션이 더 새 로그인에 의해 밀려났는지(superseded) 판정. 읽기 전용.
 * 학생이고 DB active_session_id 와 쿠키 sid 가 다르면 true. (staff·미등록=false → 무중단)
 * 추방/리다이렉트는 호출부(enforceSingleSession / 하트비트 / requireAuthentication)에서.
 */
export async function isSessionSuperseded(
  client: SupabaseClient<Database>,
  user: User,
  request: Request,
): Promise<boolean> {
  const { data: profile } = await client
    .from("profiles")
    .select("role, active_session_id")
    .eq("profile_id", user.id)
    .single();
  if (!profile || profile.role !== "student" || !profile.active_session_id) {
    return false;
  }
  const cookieSid = await readSessionId(request);
  return cookieSid !== profile.active_session_id;
}

/**
 * 단일 세션 검사. 밀려난 세션이면 이 기기만 로그아웃시키고 /login 으로 보낸다.
 * private 레이아웃 loader 에서 호출. 통과 시 아무 동작 없음.
 *
 * NOTE: 추방은 `scope: "local"`(이 기기 세션만 종료) — 새 기기 세션은 건드리지 않는다.
 */
export async function enforceSingleSession(
  client: SupabaseClient<Database>,
  user: User,
  request: Request,
  headers: Headers,
): Promise<void> {
  if (!(await isSessionSuperseded(client, user, request))) return;
  // 다른 기기에서 더 새 로그인 발생 → 이 기기 세션만 종료.
  await client.auth.signOut({ scope: "local" });
  headers.append(
    "Set-Cookie",
    await sessionIdCookie.serialize("", { maxAge: 0 }),
  );
  throw redirect("/login?reason=other-device", { headers });
}

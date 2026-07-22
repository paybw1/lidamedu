// feat-8-030 — 가입 후 필수정보(회원명·휴대전화·주소) 입력 게이트.
//
// 카카오 OAuth 는 이름을 일부만 제공하고(없으면 이메일 앞부분으로 대체) 전화번호·주소는
// 사실상 내려주지 않으므로, 필수정보를 인앱에서 강제 수집한다. profile_completed_at 이
// NULL 인 학생을 /onboarding/profile 로 보낸다. staff 는 면제. 기존 회원은 마이그레이션에서
// now() 로 백필해 면제(소급 수집은 별도 결정).
//
// ★게이트 순서상 마지막(승인·동의 다음)에 호출한다 — 프로필 게이트에 도달했다는 것은 이미
//   승인·동의를 통과했다는 뜻이라, /onboarding/profile 로 보내도 앞 게이트가 되받아치지 않는다.
//
// 호출처: core/layouts/private.layout.tsx, features/dashboard/layouts/dashboard.layout.tsx

import type { User } from "@supabase/supabase-js";
import type { Database } from "database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

import { isStaffRole } from "./roles";

// 게이트를 적용하지 않는 경로 — 필수정보 폼 자신/로그아웃/데이터 API/다른 게이트 페이지.
const ALLOW_PREFIXES = [
  "/onboarding/profile",
  "/consent",
  "/pending-approval",
  "/logout",
  "/api",
] as const;

function isAllowed(pathname: string): boolean {
  return ALLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 필수정보 미입력 학생을 /onboarding/profile 로 redirect.
 * 입력 완료(profile_completed_at)·staff·비로그인·allow-list 경로면 통과.
 */
export async function requireProfileInfo(
  client: SupabaseClient<Database>,
  user: User | null,
  request: Request,
  headers: Headers,
): Promise<void> {
  if (!user) return;
  const { pathname } = new URL(request.url);
  if (isAllowed(pathname)) return;

  const { data: prof } = await client
    .from("profiles")
    .select("role, profile_completed_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!prof) return; // 프로필 미생성 등 예외 — 게이트가 막지 않음
  if (isStaffRole(prof.role)) return; // staff 면제
  if (prof.profile_completed_at) return; // 이미 입력 완료

  throw redirect("/onboarding/profile", { headers });
}

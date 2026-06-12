// feat-8-026 — 학습 데이터 활용 필수 동의 게이트.
//
// 학습 데이터 처리는 본 서비스의 본질적 구성요소(PIPA 15①4 계약 이행)이므로
// 미동의 학생은 서비스를 이용할 수 없다. 인증 라우트를 감싸는 layout loader 에서
// 호출해 미동의 학생을 /consent 로 보낸다. staff(강사 이상)는 면제.
//
// 호출처: core/layouts/private.layout.tsx, features/dashboard/layouts/dashboard.layout.tsx

import type { User } from "@supabase/supabase-js";
import type { Database } from "database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

import { isStaffRole } from "./roles";

// 게이트를 적용하지 않는 경로(접두) — 동의 페이지 자신/로그아웃/데이터 API.
// 약관(/legal/*)은 navigation.layout 밖이라 애초에 이 게이트를 거치지 않는다.
const ALLOW_PREFIXES = ["/consent", "/logout", "/api"] as const;

function isAllowed(pathname: string): boolean {
  return ALLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 미동의 학생을 /consent 로 redirect. 동의했거나 staff/비로그인/allow-list 경로면 통과.
 * headers 는 supabase 갱신 cookie 누수 방지를 위해 redirect 에 전달한다.
 */
export async function requireServiceDataConsent(
  client: SupabaseClient<Database>,
  user: User | null,
  request: Request,
  headers: Headers,
): Promise<void> {
  if (!user) return; // 상위 auth 가드가 처리
  const { pathname } = new URL(request.url);
  if (isAllowed(pathname)) return;

  const { data: prof } = await client
    .from("profiles")
    .select("role, service_data_consent_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!prof) return; // 프로필 미생성 등 예외 — 게이트가 막지 않음
  if (isStaffRole(prof.role)) return; // 강사·관리자·원장 면제
  if (prof.service_data_consent_at) return; // 이미 동의

  throw redirect("/consent", { headers });
}

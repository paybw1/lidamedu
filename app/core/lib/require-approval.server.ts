// 서비스 접근 승인 게이트 — 운영자가 승인한 사용자만 서비스를 이용할 수 있다.
//
// profiles.access_approved_at 이 NULL 인 학생(신규 가입 기본)은 /pending-approval 로
// 보낸다. staff(강사 이상)는 면제. 기존 사용자는 마이그레이션에서 전원 승인됐다.
// 승인/해제는 /admin/users 에서 운영자가 수행한다(service_role 전용 — profiles 의
// 가드 트리거가 authenticated 요청의 자기 승인 변경을 거부).
//
// 호출처: core/layouts/private.layout.tsx, features/dashboard/layouts/dashboard.layout.tsx
// (동의 게이트보다 먼저 — 미승인 사용자에게 동의 화면을 보여줄 이유가 없다)

import type { User } from "@supabase/supabase-js";
import type { Database } from "database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

import { isStaffRole } from "./roles";

// 게이트를 적용하지 않는 경로(접두) — 대기 페이지 자신/로그아웃/데이터 API.
const ALLOW_PREFIXES = ["/pending-approval", "/logout", "/api"] as const;

function isAllowed(pathname: string): boolean {
  return ALLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 미승인 학생을 /pending-approval 로 redirect. 승인됐거나 staff/비로그인/allow-list
 * 경로면 통과. headers 는 supabase 갱신 cookie 누수 방지를 위해 redirect 에 전달.
 */
export async function requireAccessApproval(
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
    .select("role, access_approved_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!prof) return; // 프로필 미생성 등 예외 — 게이트가 막지 않음
  if (isStaffRole(prof.role)) return; // 강사·관리자·원장 면제
  if (prof.access_approved_at) return; // 이미 승인

  throw redirect("/pending-approval", { headers });
}

/**
 * Authentication and Request Guards Module
 * 
 * This module provides utility functions for protecting routes and API endpoints
 * by enforcing authentication and HTTP method requirements. These guards are designed
 * to be used in React Router loaders and actions to ensure proper access control
 * and request validation.
 * 
 * The module includes:
 * - Authentication guard to ensure a user is logged in
 * - HTTP method guard to ensure requests use the correct HTTP method
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { data } from "react-router";

import { ROLE_RANK, type UserRole } from "~/core/lib/roles";
import { isSessionSuperseded } from "~/core/lib/single-session.server";

/**
 * Require user authentication for a route or action
 * 
 * This function checks if a user is currently authenticated by querying the Supabase
 * client. If no user is found, it throws a 401 Unauthorized response, which will be
 * handled by React Router's error boundary system.
 * 
 * @example
 * // In a loader or action function
 * export async function loader({ request }: LoaderArgs) {
 *   const [client] = makeServerClient(request);
 *   await requireAuthentication(client);
 *   
 *   // Continue with authenticated logic...
 *   return json({ ... });
 * }
 * 
 * @param client - The Supabase client instance to use for authentication check
 * @throws {Response} 401 Unauthorized if no user is authenticated
 */
export async function requireAuthentication(
  client: SupabaseClient<Database>,
  request?: Request,
) {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data(null, { status: 401 });
  }
  // feat-000-016 2단계 — 다른 기기에서 더 새 로그인했으면 이 요청(주로 민감 API action) 거부.
  // request 를 넘긴 호출부만 적용(기존 호출은 무영향).
  if (request && (await isSessionSuperseded(client, user, request))) {
    throw data(null, { status: 401 });
  }
}

/**
 * Require a specific HTTP method for a route action
 * 
 * This function returns a middleware that checks if the incoming request uses
 * the specified HTTP method. If not, it throws a 405 Method Not Allowed response.
 * This is useful for ensuring that endpoints only accept the intended HTTP methods.
 * 
 * @example
 * // In an action function
 * export async function action({ request }: ActionArgs) {
 *   requireMethod('POST')(request);
 *   
 *   // Continue with POST-specific logic...
 *   return json({ ... });
 * }
 * 
 * @param method - The required HTTP method (e.g., 'GET', 'POST', 'PUT', 'DELETE')
 * @returns A function that validates the request method
 * @throws {Response} 405 Method Not Allowed if the request uses an incorrect method
 */
export function requireMethod(method: string) {
  return (request: Request) => {
    if (request.method !== method) {
      throw data(null, { status: 405 });
    }
  };
}

/**
 * Require the current user to hold at least the given role rank.
 *
 * 4단계 등급(student < instructor < manager < admin) 기준으로, 현재 사용자의
 * 역할이 `minRole` 미만이면 403을 던진다. 콘텐츠/운영 화면의 loader·action 에서
 * `requireMinRole(client, "manager")` 처럼 사용한다.
 *
 * @param client - 요청 컨텍스트 Supabase 클라이언트 (RLS 적용)
 * @param minRole - 허용 최소 역할
 * @returns 검증된 사용자의 실제 역할
 * @throws {Response} 401 미인증 / 403 등급 미달
 */
export async function requireMinRole(
  client: SupabaseClient<Database>,
  minRole: UserRole,
): Promise<UserRole> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data(null, { status: 401 });
  }
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  const role: UserRole = profile?.role ?? "student";
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw data(null, { status: 403 });
  }
  return role;
}

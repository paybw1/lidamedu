/**
 * E2E Test Helper Functions
 *
 * 로그인이 카카오 OAuth 단일로 바뀌면서(이메일/비밀번호 폼 제거) 브라우저에서 폼으로
 * 로그인할 수 없다. 카카오 OAuth 는 Playwright 로 자동화가 어려우므로, 테스트는
 * Supabase password grant 로 세션을 받아 @supabase/ssr 가 쓰는 쿠키 포맷 그대로 캡처해
 * 브라우저 컨텍스트에 주입한다. (Supabase auth 자체는 password grant 를 계속 지원하며,
 * 카카오 전용은 앱 UI 차원의 제약이다.)
 */

import { type Page, expect } from "@playwright/test";
import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";

import db from "~/core/db/drizzle-client.server";

const TEST_DOMAIN = "localhost";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`E2E: 환경변수 ${name} 가 필요합니다`);
  return value;
}

/**
 * Check if a form field has validation errors
 *
 * Uses the browser's built-in form validation API to assert a field is invalid
 * and surfaces a non-empty validation message.
 */
export async function checkInvalidField(page: Page, fieldId: string) {
  const isValid = await page.$eval(
    `#${fieldId}`,
    (el: HTMLInputElement) => el.validity.valid,
  );
  expect(isValid).toBe(false);

  const message = await page.$eval(
    `#${fieldId}`,
    (el: HTMLInputElement) => el.validationMessage,
  );
  expect(message).not.toBe("");
}

/**
 * service_role Supabase 클라이언트 (테스트 전용 — 사용자 생성/정리)
 */
function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * 이메일 확인이 끝난 테스트 사용자를 생성한다 (admin API).
 *
 * 카카오 전용 전환으로 가입 폼이 사라졌으므로, 테스트 사용자는 service_role 로 직접 만든다.
 * password 를 부여하므로 이후 loginUser 로 프로그래매틱 로그인이 가능하다.
 *
 * @returns 생성된 사용자의 profile_id (auth user id)
 */
export async function createConfirmedUser(
  email: string,
  password: string,
  name?: string,
): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name, display_name: name } : undefined,
  });
  if (error || !data.user) {
    throw new Error(`createConfirmedUser 실패 (${email}): ${error?.message}`);
  }
  return data.user.id;
}

function normalizeSameSite(
  value: CookieOptions["sameSite"],
): "Strict" | "Lax" | "None" {
  if (value === "strict" || value === true) return "Strict";
  if (value === "none") return "None";
  return "Lax";
}

/**
 * 프로그래매틱 로그인 — 폼 입력 없이 세션 쿠키를 브라우저에 주입한다.
 *
 * 1. @supabase/ssr createServerClient 로 password grant 수행
 * 2. setAll 로 떨어지는 인증 쿠키(앱과 동일 포맷, 청크 포함)를 캡처
 * 3. Playwright 컨텍스트에 주입 후 홈을 한 번 로드해 세션 활성화
 *
 * 사용자는 미리 존재해야 한다(createConfirmedUser 또는 admin.createUser).
 */
export async function loginUser(page: Page, email: string, password: string) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const captured: { name: string; value: string; options: CookieOptions }[] =
    [];
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        for (const cookie of cookies) captured.push(cookie);
      },
    },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`E2E loginUser 실패 (${email}): ${error.message}`);
  }
  if (captured.length === 0) {
    throw new Error("E2E loginUser: 인증 쿠키가 생성되지 않았습니다");
  }

  await page.context().addCookies(
    captured.map(({ name, value, options }) => ({
      name,
      value,
      domain: TEST_DOMAIN,
      path: options.path ?? "/",
      httpOnly: false,
      secure: false,
      sameSite: normalizeSameSite(options.sameSite),
      expires:
        typeof options.maxAge === "number"
          ? Math.floor(Date.now() / 1000) + options.maxAge
          : -1,
    })),
  );

  // 세션 활성화 — 이후 spec 이 보호 라우트로 곧장 이동할 수 있도록 홈을 한 번 로드.
  await page.goto("/");
}

/**
 * Delete a test user from auth.users (직접 DB 삭제 — admin API 가 이 환경에서 무효).
 */
export async function deleteUser(email: string) {
  await db.delete(authUsers).where(eq(authUsers.email, email));
}

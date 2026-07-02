// id/pw(이메일·비밀번호) 로그인·가입 노출 토글. 기본 OFF(카카오만).
// 운영자가 /admin/auth 에서 켜면 로그인·가입 화면에 이메일/비번 폼이 노출된다.
// ★서버 권위: 로그인·가입 action 도 이 값을 확인(UI 숨김만으론 불충분).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getAppSetting, setAppSetting } from "~/core/lib/app-settings.server";

export const PASSWORD_LOGIN_KEY = "password_login_enabled";

/** id/pw 로그인·가입 사용 여부. 미설정=false(숨김). */
export async function isPasswordLoginEnabled(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const raw = await getAppSetting(client, PASSWORD_LOGIN_KEY);
  return raw === true;
}

export async function setPasswordLoginEnabled(
  client: SupabaseClient<Database>,
  enabled: boolean,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setAppSetting(client, PASSWORD_LOGIN_KEY, enabled, userId);
}

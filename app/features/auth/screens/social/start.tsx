/**
 * Social Authentication Start Screen
 *
 * This component initiates the OAuth flow for social authentication providers.
 * It handles the redirection to the third-party authentication provider (e.g., GitHub, Kakao)
 * and sets up the callback URL for when the authentication is complete.
 *
 * The social authentication flow consists of two steps:
 * 1. This screen: Initiates the OAuth flow and redirects to the provider
 * 2. Complete screen: Handles the callback from the provider and completes the authentication
 *
 * This implementation uses Supabase's OAuth authentication system.
 */
import type { Route } from "./+types/start";

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

/**
 * Schema for validating URL parameters
 *
 * 지원 OAuth provider: 카카오, 구글. 그 외는 서버에서 거부한다.
 */
const paramsSchema = z.object({
  provider: z.enum(["kakao", "google"]),
});

/**
 * Loader function for the social authentication start page
 *
 * This function initiates the OAuth flow with the specified provider:
 * 1. Validates the provider parameter from the URL
 * 2. Initializes the OAuth flow with Supabase
 * 3. Sets up the redirect URL for when authentication is complete
 * 4. Redirects the user to the provider's authentication page
 *
 * @param params - URL parameters containing the provider name
 * @param request - The incoming request
 * @returns Redirect to the provider's auth page or error response
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  // Validate the provider parameter
  const { error, success, data: parsedParams } = paramsSchema.safeParse(params);
  if (!success) {
    return data({ error: "Invalid provider" }, { status: 400 });
  }

  // Create Supabase client and get response headers for auth cookies
  const [client, headers] = makeServerClient(request);

  // dev(localhost)에서는 요청 origin 으로 콜백을 돌려보낸다 — SITE_URL(운영)로 고정하면
  // localhost 에서 소셜 로그인 후 운영 사이트(lidamipedu.com)로 튕긴다. localhost 는 Supabase
  // Redirect 허용목록(http://localhost:5173/**)에 등록돼 있어 콜백이 정상 수락된다.
  // 운영에서는 기존대로 SITE_URL 사용. 끝 슬래시 제거 — 안 그러면 `//auth/...` 이중 슬래시로
  // 허용목록과 불일치(bad_oauth_state)로 이어진다.
  const reqUrl = new URL(request.url);
  const isLocalhost =
    reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
  const siteUrl = isLocalhost
    ? reqUrl.origin
    : (process.env.SITE_URL ?? reqUrl.origin).replace(/\/+$/, "");

  // Initialize OAuth flow with the specified provider
  const { data: signInData, error: signInError } =
    await client.auth.signInWithOAuth({
      provider: parsedParams.provider,
      options: {
        // 카카오는 Supabase(GoTrue)가 account_email·profile_image·profile_nickname 을
        // 강제 요청하므로 scopes 로 줄일 수 없다. account_email 동의항목은 비즈앱 전환이
        // 전제 — 카카오 콘솔에서 세 항목 모두 동의항목 ON 해야 KOE205 가 사라진다.
        redirectTo: `${siteUrl}/auth/social/complete/${parsedParams.provider}`,
      },
    });

  // Return error if OAuth initialization fails
  if (signInError) {
    return data({ error: signInError.message }, { status: 400 });
  }

  // Redirect to the provider's authentication page with auth headers
  return redirect(signInData.url, { headers });
}

/**
 * Social Authentication Start Component
 *
 * This component is only rendered if there's an error during the OAuth initialization.
 * Under normal circumstances, the loader function will redirect the user directly to
 * the authentication provider's login page before this component is rendered.
 *
 * If there's an error (e.g., invalid provider, network issues), this component
 * displays the error message and prompts the user to try again.
 *
 * @param loaderData - Data from the loader containing any error messages
 */
export default function StartSocialLogin({ loaderData }: Route.ComponentProps) {
  // Extract error from loader data
  const { error } = loaderData;

  return (
    <div className="flex flex-col items-center justify-center gap-2.5">
      {/* Display error message */}
      <h1 className="text-2xl font-semibold">{error}</h1>
      <p className="text-muted-foreground">Please try again.</p>
    </div>
  );
}

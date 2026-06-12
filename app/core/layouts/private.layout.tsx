import type { Route } from "./+types/private.layout";

import { Outlet, data, redirect } from "react-router";

import { CommandPalette } from "~/core/components/command-palette";
import { requireServiceDataConsent } from "../lib/require-consent.server";
import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 는 supabase 가 refresh_token 으로 access_token 을 자동 갱신할 때
  // setAll 콜백으로 누적되는 Set-Cookie 들. 응답에 반드시 전달해야 브라우저가
  // 새 cookie 를 저장하고 다음 요청이 살아있는 세션으로 동작.
  // 빠뜨리면 갱신된 토큰이 휘발돼 access 만료 즉시 /login 무한 redirect.
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login", { headers });
  }

  // feat-8-026 — 학습 데이터 활용 미동의 학생은 /consent 로. staff/동의자/allow-list 통과.
  await requireServiceDataConsent(client, user, request, headers);

  return data({}, { headers });
}

export default function PrivateLayout() {
  return (
    <>
      <CommandPalette />
      <Outlet />
    </>
  );
}

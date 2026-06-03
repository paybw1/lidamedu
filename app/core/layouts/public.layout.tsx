import type { Route } from "./+types/public.layout";

import { Outlet, data, redirect } from "react-router";

import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  // headers — supabase refresh_token 갱신 시 setAll 콜백이 누적하는 Set-Cookie.
  // 응답에 반드시 전달해야 다음 요청도 살아있는 세션. (private.layout 와 동일 이유)
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    throw redirect("/dashboard", { headers });
  }

  return data({}, { headers });
}

export default function PublicLayout() {
  return <Outlet />;
}

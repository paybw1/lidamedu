import { Outlet, data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/dashboard.layout";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login", { headers });
  }
  return data(null, { headers });
}

export default function DashboardLayout() {
  return <Outlet />;
}

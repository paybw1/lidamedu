import { Outlet, data, redirect } from "react-router";

import { requireServiceDataConsent } from "~/core/lib/require-consent.server";
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
  // feat-8-026 — 학습 데이터 활용 미동의 학생은 /consent 로.
  await requireServiceDataConsent(client, user, request, headers);
  return data(null, { headers });
}

export default function DashboardLayout() {
  return <Outlet />;
}

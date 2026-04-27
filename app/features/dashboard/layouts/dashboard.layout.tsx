import { Outlet, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/dashboard.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  return null;
}

export default function DashboardLayout() {
  return <Outlet />;
}

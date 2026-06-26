import type { Route } from "./+types/logout";

import { redirect } from "react-router";

import { releaseSession } from "~/core/lib/single-session.server";
import makeServerClient from "~/core/lib/supa-client.server";

export async function loader({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  // feat-000-016 — 단일 세션 해제(DB active_session_id 비우고 쿠키 만료). signOut 전에(자기 행 RPC).
  await releaseSession(client, headers);
  await client.auth.signOut();
  return redirect("/", { headers });
}

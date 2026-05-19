// feat-8-008 — 2차 모의고사(온라인 GS, /gs/*) 영역 게이트.
// 회원3(area_mock_exams)만 진입. staff 면제. 미보유 시 /pricing redirect.

import { Outlet } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/gs.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await requireFeature(client, user.id, "area_mock_exams");
  }
  return null;
}

export default function GsLayout() {
  return <Outlet />;
}

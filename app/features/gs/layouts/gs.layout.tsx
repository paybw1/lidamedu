// feat-8-008 — 2차 모의고사(온라인 GS, /gs/*) 영역 게이트.
// 회원3(area_mock_exams)만 진입. staff 면제. 미보유 시 /pricing redirect.

import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/gs.layout";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await requireFeature(client, user.id, "area_mock_exams");
  }
  return data(null, { headers });
}

export default function GsLayout() {
  return <Outlet />;
}

// feat-8-008 — 학습관리(학습목표·진도·학습통계·과제) 영역 게이트.
// 회원3(area_study_mgmt)만 진입. staff 는 requireFeature 가 면제.
// 미보유 시 /pricing?locked=area_study_mgmt 로 redirect. UI 없음 — <Outlet/> 만.

import { Outlet } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/study-management.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await requireFeature(client, user.id, "area_study_mgmt");
  }
  return null;
}

export default function StudyManagementLayout() {
  return <Outlet />;
}

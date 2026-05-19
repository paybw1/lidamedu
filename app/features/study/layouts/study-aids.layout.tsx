// feat-8-008 — 학습보조(오답노트·하이라이트·즐겨찾기·메모·암기) 영역 게이트.
// 회원2(area_study_aids) 이상만 진입. staff 는 requireFeature 가 면제.
// 미보유 시 /pricing?locked=area_study_aids 로 redirect. UI 없음 — <Outlet/> 만.

import { Outlet } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/study-aids.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    await requireFeature(client, user.id, "area_study_aids");
  }
  return null;
}

export default function StudyAidsLayout() {
  return <Outlet />;
}

// feat-8-008 — 학습과목(/subjects/*) 영역 게이트.
// 회원2(area_subjects) 이상만 진입. staff(강사/관리자/원장)는 requireFeature 가 면제.
// 미보유 시 /pricing?locked=area_subjects 로 redirect. UI 는 없음 — <Outlet/> 만.

import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/subjects.layout";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  // 비로그인은 상위 private.layout 이 처리 — 여기서는 로그인 사용자만 게이트.
  if (user) {
    await requireFeature(client, user.id, "area_subjects");
  }
  return data(null, { headers });
}

export default function SubjectsLayout() {
  return <Outlet />;
}

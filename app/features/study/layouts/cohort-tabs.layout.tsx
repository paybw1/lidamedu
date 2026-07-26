// 종합반 탭(CohortTabs) 전용 bare 레이아웃 — 영역 게이트 없음.
//   상담(/me/consult)용 — 알림 student_note_shared 목적지라 비구독자도 접근해야 해 게이트 없음
//   (study-mgmt-tabs.layout 과 동일 사유, 탭만 CohortTabs).
import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { CohortTabs } from "~/features/study/components/cohort-tabs";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import type { Route } from "./+types/cohort-tabs.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ gradeStaff: false, features: [] as string[] }, { headers });
  }
  const access = await getMembershipAccess(client, user.id);
  return data(
    { gradeStaff: access.grade === "staff", features: access.features },
    { headers },
  );
}

export default function CohortTabsLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <CohortTabs
        isStaff={loaderData.gradeStaff}
        features={loaderData.features}
      />
      <Outlet />
    </>
  );
}

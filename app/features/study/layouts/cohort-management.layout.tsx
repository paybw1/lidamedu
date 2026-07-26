// 종합반 영역 게이트 레이아웃 — 과제(/assignments)용. area_study_mgmt 게이트 유지(기존 동일)
//   + 상단에 종합반 탭(CohortTabs) 노출. study-management.layout(StudyMgmtTabs)의 종합반판.
import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { CohortTabs } from "~/features/study/components/cohort-tabs";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/cohort-management.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ gradeStaff: false, features: [] as string[] }, { headers });
  }
  const access = await requireFeature(client, user.id, "area_study_mgmt");
  return data(
    { gradeStaff: access.grade === "staff", features: access.features },
    { headers },
  );
}

export default function CohortManagementLayout({
  loaderData,
}: Route.ComponentProps) {
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

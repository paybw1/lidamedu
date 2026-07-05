// feat-8-008 — 학습관리(학습목표·진도·학습통계·과제) 영역 게이트.
// 회원3(area_study_mgmt)만 진입. staff 는 requireFeature 가 면제.
// 미보유 시 /pricing?locked=area_study_mgmt 로 redirect.
//
// UI: 상단에 학습관리 탭 항상 노출 — 학생이 dropdown 을 열지 않고도 7개 화면 간
// 한 번 클릭으로 이동. 디자인 시스템 v1 (Surface·토큰) 사용.

import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";
import { requireFeature } from "~/features/subscriptions/queries.server";

import type { Route } from "./+types/study-management.layout";

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data(
      { gradeStaff: false, features: [] as string[] },
      { headers },
    );
  }
  const access = await requireFeature(client, user.id, "area_study_mgmt");
  // 탭 노출 판정(종합반 전용 과제·상담) — 게이트에서 얻은 access 재사용.
  return data(
    { gradeStaff: access.grade === "staff", features: access.features },
    { headers },
  );
}

export default function StudyManagementLayout({
  loaderData,
}: Route.ComponentProps) {
  return (
    <>
      <StudyMgmtTabs
        isStaff={loaderData.gradeStaff}
        features={loaderData.features}
      />
      <Outlet />
    </>
  );
}

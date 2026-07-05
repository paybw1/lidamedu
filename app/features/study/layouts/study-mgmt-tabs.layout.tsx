// 학습관리 토글(StudyMgmtTabs) 전용 bare 레이아웃 — 영역 게이트 없음.
// 게이트 없이 토글만 필요한 학습관리 화면용. 예: /me/consult(강사 공유 상담 코멘트 열람) —
//   알림 student_note_shared 의 목적지라 비구독자도 접근 가능해야 해 area_study_mgmt 게이트를 걸지 않는다.
//   (모의고사의 /me/exam-results·/me/ox-sessions 가 bare mock.layout 으로 토글만 얹은 것과 동일 패턴.)
// 게이트가 필요한 화면(/goals·/study/stats·/assignments)은 study-management.layout(requireFeature) 사용.
import { Outlet, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import type { Route } from "./+types/study-mgmt-tabs.layout";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ gradeStaff: false, features: [] as string[] }, { headers });
  }
  // 탭 노출 판정(종합반 전용 과제·상담) — 게이트는 없고 표시만.
  const access = await getMembershipAccess(client, user.id);
  return data(
    { gradeStaff: access.grade === "staff", features: access.features },
    { headers },
  );
}

export default function StudyMgmtTabsLayout({
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

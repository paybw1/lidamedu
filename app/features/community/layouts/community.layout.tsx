// 커뮤니티 영역 공용 레이아웃 — 화면 내 토글(AreaTabs) 단일 부착점.
// 게이트 없음(커뮤니티는 무료 영역). 토글 항목 = SSOT(AREA_GROUP_IDS.community) 파생 →
// 상단바 드롭다운과 항상 일치(공지·자유게시판·스터디·Q&A·수기·가이드). 다른 영역 토글과 동일 디자인(AreaTabs).
// ★반별 게시판은 종합반(cohort) 그룹으로 이관(feat-2-031) — 커뮤니티 strip 에서 제외, /cohort-boards 는 CohortTabs.
// ★이 영역은 **학습 플랫폼**(navigation.layout) 소속이다. 2026-07-27 에 강의 상단바 유지를
//   위해 lecture.layout 아래로 옮기고 서브내비를 강의 4탭으로 바꿨으나, 2026-08-04 의 강의
//   플랫폼 비-staff 차단 게이트가 이 영역까지 막아 학생이 게시판에서 lidamedu.com 으로
//   튕겨 나갔다 — 원위치로 되돌림(2026-08-23). 강의 상단바 커뮤니티 드롭다운은 이 화면들로
//   링크되며, 진입 시 학습 플랫폼 컨텍스트로 넘어간다(게시판 데이터는 두 플랫폼 공유).
import { Outlet, data } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";
import makeServerClient from "~/core/lib/supa-client.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import type { Route } from "./+types/community.layout";

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

export default function CommunityLayout({ loaderData }: Route.ComponentProps) {
  const items: SectionTabItem[] = topbarDropdownItems(
    AREA_GROUP_IDS.community,
    loaderData.gradeStaff,
    loaderData.features,
  ).map((link) => ({
    id: link.to,
    to: link.to,
    label: link.label,
    match: [link.to.split("?")[0]],
  }));
  return (
    <>
      <AreaTabs ariaLabel="커뮤니티" items={items} />
      <Outlet />
    </>
  );
}

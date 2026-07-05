// 커뮤니티 영역 공용 레이아웃 — 화면 내 토글(AreaTabs) 단일 부착점.
// 게이트 없음(커뮤니티는 무료 영역). 토글 항목 = SSOT(AREA_GROUP_IDS.community) 파생 →
// 상단바 드롭다운과 항상 일치(공지·자유게시판·스터디·반별·Q&A·수기). 다른 영역 토글과 동일 디자인(AreaTabs).
// 반별 게시판은 종합반 전용(feature: cohort_curriculum) — 일반 수험생에게 숨김(loader 로 멤버십 판정).
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

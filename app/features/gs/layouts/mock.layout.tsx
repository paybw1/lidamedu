// 모의고사 영역 공용 토글 레이아웃 — 화면 내 토글(AreaTabs) 부착점.
// ★게이트 없음(bare) — 영역 게이트는 기존대로(/gs 는 gs.layout 의 area_mock_exams). 토글만 얹는다.
// 토글 항목 = SSOT(AREA_GROUP_IDS.mock) 파생 → 상단바 드롭다운과 일치
//   (1차 모의·2차 모의 GS·GS 논점추출·판례 쟁점훈련·응시 결과·정오문제 응시 이력).
// 다른 영역과 동일 AreaTabs(텍스트만+최상단 sticky).
// 주의: "1차 모의고사"(/latest/mcq?kind=mock)는 학습정보 화면(LatestShell)과 공유라 이 레이아웃 밖 —
//   토글의 해당 탭은 그 화면으로 링크되나 거기선 학습정보 토글이 보인다(공유 화면 cross-over).
import { Outlet } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";

const ITEMS: SectionTabItem[] = topbarDropdownItems(AREA_GROUP_IDS.mock).map(
  (link) => ({
    id: link.to,
    to: link.to,
    label: link.label,
    match: [link.to.split("?")[0]],
  }),
);

export default function MockLayout() {
  return (
    <>
      <AreaTabs ariaLabel="모의고사" items={ITEMS} />
      <Outlet />
    </>
  );
}

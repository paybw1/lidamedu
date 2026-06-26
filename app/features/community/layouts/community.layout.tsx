// 커뮤니티 영역 공용 레이아웃 — 화면 내 토글(AreaTabs) 단일 부착점.
// 게이트 없음(커뮤니티는 무료 영역). 토글 항목 = SSOT(AREA_GROUP_IDS.community) 파생 →
// 상단바 드롭다운과 항상 일치(공지·자유게시판·스터디·반별·Q&A·수기). 다른 영역 토글과 동일 디자인(AreaTabs).
import { Outlet } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";

const ITEMS: SectionTabItem[] = topbarDropdownItems(
  AREA_GROUP_IDS.community,
).map((link) => ({
  id: link.to,
  to: link.to,
  label: link.label,
  match: [link.to.split("?")[0]],
}));

export default function CommunityLayout() {
  return (
    <>
      <AreaTabs ariaLabel="커뮤니티" items={ITEMS} />
      <Outlet />
    </>
  );
}

// 커뮤니티 영역 공용 레이아웃 — 화면 내 토글(AreaTabs) 단일 부착점.
// ★이 영역은 강의 플랫폼(lecture.layout) 아래에만 마운트된다(routes.ts lecture-private).
//   따라서 서브내비 = 강의 플랫폼 커뮤니티 4탭(자유게시판·스터디 모집·합격 수기·강사 모집)
//   = LECTURE_COMMUNITY_LINKS SSOT(상단바 드롭다운과 동일). 학습 플랫폼 커뮤니티(6종:
//   공지·자유·스터디·Q&A·수기·가이드)는 별개 nav(nav-groups) — 게시판 데이터만 공유한다.
// ★공지사항(/announcements)·이용가이드(/guide)는 커뮤니티 탭이 아니므로 그 페이지에선
//   4탭 바를 숨긴다(강의 커뮤니티 = 게시판 3종 + 강사모집).
// ★반별 게시판은 종합반(cohort) 그룹으로 이관(feat-2-031) — /cohort-boards 는 CohortTabs.
import { Outlet, useLocation } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { LECTURE_COMMUNITY_LINKS } from "~/core/lib/platforms";

export default function CommunityLayout() {
  const { pathname } = useLocation();
  // 게시판(자유·스터디·수기 = /community/*) 및 허브에서만 4탭 노출. 공지·가이드는 제외.
  const onBoard = pathname === "/community" || pathname.startsWith("/community/");
  const items: SectionTabItem[] = LECTURE_COMMUNITY_LINKS.map((link) => ({
    id: link.to,
    to: link.to,
    label: link.label,
    match: [link.to.split("?")[0]],
  }));
  return (
    <>
      {onBoard ? <AreaTabs ariaLabel="커뮤니티" items={items} /> : null}
      <Outlet />
    </>
  );
}

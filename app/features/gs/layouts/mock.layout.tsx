// 모의고사 영역 공용 토글 레이아웃 — 화면 내 토글(AreaTabs) 부착점.
// ★게이트 없음(bare) — 영역 게이트는 기존대로(/gs 는 gs.layout, 통합 색인은 mcq-exam.layout 의
//   area_mock_exams). 토글만 얹는다.
// 토글 항목 = SSOT(AREA_GROUP_IDS.mock1/mock2) 파생 → 상단바 드롭다운·사이드바와 일치.
//   1차(통합·진도별) vs 2차(논점추출·목차잡기·답안작성)를 경로로 분기해 자기 라운드 토글만 표시.
// 부착처: 통합 모의 색인 /latest/mcq/exams(mock-area-mcq-exams) = 1차 ·
//   /gs/*(mock-area-gs) · /case-training(mock-area-case) = 2차.
//   "1차 진도별"(/latest/mcq?kind=mock_progressive)은 학습정보와 공유 라우트라 layout 밖 —
//   거기선 McqAreaShell 이 같은 1차 모의고사 토글을 직접 얹는다(cross-over 해소).
import { Outlet, useLocation } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, areaTabItems } from "~/core/lib/nav-groups";

const ROUND1_ITEMS: SectionTabItem[] = areaTabItems(AREA_GROUP_IDS.mock1);
const ROUND2_ITEMS: SectionTabItem[] = areaTabItems(AREA_GROUP_IDS.mock2);

// 2차(주관식) 훈련 경로 — 논점추출(/gs/issues)·답안작성(/gs)·목차잡기(/case-training).
// 그 외(통합 모의 색인 /latest/mcq/exams)는 1차.
function isRound2(pathname: string): boolean {
  return pathname === "/gs" || pathname.startsWith("/gs/") || pathname.startsWith("/case-training");
}

export default function MockLayout() {
  const { pathname } = useLocation();
  const round2 = isRound2(pathname);
  return (
    <>
      <AreaTabs
        ariaLabel={round2 ? "2차 모의고사" : "1차 모의고사"}
        items={round2 ? ROUND2_ITEMS : ROUND1_ITEMS}
      />
      <Outlet />
    </>
  );
}

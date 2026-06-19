// 모의고사 영역 공용 토글 레이아웃 — 화면 내 토글(AreaTabs) 부착점.
// ★게이트 없음(bare) — 영역 게이트는 기존대로(/gs 는 gs.layout, 통합 색인은 mcq-exam.layout 의
//   area_mock_exams). 토글만 얹는다.
// 토글 항목 = SSOT(AREA_GROUP_IDS.mock) 파생 → 상단바 드롭다운과 일치
//   (1차 통합·1차 진도별·2차 GS·GS 논점추출·판례 쟁점훈련·응시 결과·정오문제 응시 이력).
// 다른 영역과 동일 AreaTabs(텍스트만+최상단 sticky).
// 부착처: /gs/*(mock-area-gs) · 통합 모의 색인 /latest/mcq/exams(mock-area-mcq-exams) ·
//   /case-training(mock-area-case) · /me/exam-results·/me/ox-sessions(mock-area-me).
//   "1차 진도별"(/latest/mcq?kind=mock_progressive)은 학습정보와 공유 라우트라 layout 밖 —
//   거기선 McqAreaShell 이 같은 모의고사 토글을 직접 얹는다(cross-over 해소).
import { Outlet } from "react-router";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, areaTabItems } from "~/core/lib/nav-groups";

// 토글 항목 = SSOT(AREA_GROUP_IDS.mock) 파생 — McqAreaShell(모의 분기)과 같은 헬퍼를 써
// 동일 항목·match 보장(드리프트 방지).
const ITEMS: SectionTabItem[] = areaTabItems(AREA_GROUP_IDS.mock);

export default function MockLayout() {
  return (
    <>
      <AreaTabs ariaLabel="모의고사" items={ITEMS} />
      <Outlet />
    </>
  );
}

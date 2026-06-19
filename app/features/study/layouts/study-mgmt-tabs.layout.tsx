// 학습관리 토글(StudyMgmtTabs) 전용 bare 레이아웃 — 영역 게이트 없음.
// 게이트 없이 토글만 필요한 학습관리 화면용. 예: /me/consult(강사 공유 상담 코멘트 열람) —
//   알림 student_note_shared 의 목적지라 비구독자도 접근 가능해야 해 area_study_mgmt 게이트를 걸지 않는다.
//   (모의고사의 /me/exam-results·/me/ox-sessions 가 bare mock.layout 으로 토글만 얹은 것과 동일 패턴.)
// 게이트가 필요한 화면(/goals·/study/stats·/assignments)은 study-management.layout(requireFeature) 사용.
import { Outlet } from "react-router";

import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";

export default function StudyMgmtTabsLayout() {
  return (
    <>
      <StudyMgmtTabs />
      <Outlet />
    </>
  );
}

// 객관식 색인·팩 화면 공통 셸 분기 (feat-10-005 후속).
// 기출 색인은 학습정보 영역(LatestShell), 모의 색인은 모의고사 영역(MockExamShell)으로 —
// 진입 맥락에 맞는 sticky 영역 토글을 보여 준다.
//
// /latest/mcq 는 기출(학습정보)·모의(모의고사) 두 영역이 공유하는 단일 라우트라 layout 으로
// 감쌀 수 없다. 그래서 모의 분기에서는 모의고사 sticky 토글(AreaTabs)을 여기서 직접 얹는다
// (다른 모의 화면 — /gs·통합 모의 색인 등 — 은 mock.layout 이 같은 토글을 얹는다).
// MockExamShell 은 더 이상 자체 탭 strip 을 렌더하지 않으므로 이중 토글이 생기지 않는다.

import type { ReactNode } from "react";

import { AreaTabs } from "~/core/components/student";
import { AREA_GROUP_IDS, areaTabItems } from "~/core/lib/nav-groups";
import { LatestShell } from "~/features/latest/components/latest-shell";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";

const MOCK_TAB_ITEMS = areaTabItems(AREA_GROUP_IDS.mock);

export function McqAreaShell({
  isMock,
  ...props
}: {
  /** true = 모의 팩/모의 색인 → 모의고사 셸, false = 기출 → 학습정보 셸. */
  isMock: boolean;
  width?: "index" | "feed" | "narrow";
  title: ReactNode;
  desc: ReactNode;
  headerRight?: ReactNode;
  backLink?: { to: string; label: string };
  children: ReactNode;
}) {
  if (!isMock) return <LatestShell category="mcq" {...props} />;
  return (
    <>
      <AreaTabs ariaLabel="모의고사" items={MOCK_TAB_ITEMS} />
      <MockExamShell category="progressive" {...props} />
    </>
  );
}

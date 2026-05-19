// 객관식 색인·팩 화면 공통 셸 분기 (feat-10-005 후속).
// 기출 팩·기출 색인은 학습정보 영역(LatestShell), 모의 팩·진도별 모의 색인은
// 모의고사 영역(MockExamShell)으로 — 진입 맥락에 맞는 탭 strip 을 보여 준다.

import type { ReactNode } from "react";

import { LatestShell } from "~/features/latest/components/latest-shell";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";

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
  return isMock ? (
    <MockExamShell category="progressive" {...props} />
  ) : (
    <LatestShell category="mcq" {...props} />
  );
}

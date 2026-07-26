// 종합반(cohort) 영역 공용 탭 — 항상 보이는 가로 네비.
// ★항목 목록은 SSOT(nav-groups: AREA_GROUP_IDS.cohort)에서 파생 — 상단바 '종합반' 드롭다운과 동일.
//   반별 게시판·과제·상담·1차 모의·2차 모의를 한 strip 으로 묶어 종합반 화면 간 이동을 제공한다.
//   (구조는 StudyMgmtTabs 와 동일 — 그룹만 cohort.)
import type { ComponentType } from "react";

import {
  ClipboardListIcon,
  ListChecksIcon,
  MessageSquareIcon,
  PenLineIcon,
  UsersIcon,
} from "lucide-react";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";

const ICON_BY_TO: Record<string, ComponentType<{ className?: string }>> = {
  "/cohort-boards": UsersIcon,
  "/assignments": ClipboardListIcon,
  "/me/consult": MessageSquareIcon,
  "/latest/mcq/exams": ListChecksIcon,
  "/gs/issues": PenLineIcon,
};

// isStaff/features — 종합반 전용 항목(과제·상담·게시판) 노출 판정. 미전달 시 학생에겐 숨김(안전 기본).
//   모의 링크(feature 무관)는 항상 표시. 실제 접근 권위는 각 화면 서버 게이트.
export function CohortTabs({
  isStaff = false,
  features,
}: {
  isStaff?: boolean;
  features?: string[];
}) {
  const items: SectionTabItem[] = topbarDropdownItems(
    AREA_GROUP_IDS.cohort,
    isStaff,
    features,
  ).map((link) => {
    const path = link.to.split("?")[0];
    return {
      id: path,
      to: link.to,
      label: link.label,
      icon: ICON_BY_TO[path],
      match: [path],
    };
  });
  return <AreaTabs ariaLabel="종합반" items={items} />;
}

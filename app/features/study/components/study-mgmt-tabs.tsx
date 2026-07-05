// 학습관리 영역 공용 탭 — 항상 보이는 가로 네비.
// ★항목 목록은 SSOT(nav-groups: AREA_GROUP_IDS.manage)에서 파생 — 상단바 드롭다운과 동일.
//   토글=드롭다운 항상 일치(상담 코멘트 등 자동 포함, 하드코딩 드리프트 불가).
//   아이콘·match(활성 매칭)만 to 로 매핑하는 표시 메타.
import type { ComponentType } from "react";

import {
  ClipboardListIcon,
  LayersIcon,
  ListChecksIcon,
  MessageSquareIcon,
  RepeatIcon,
  SparklesIcon,
} from "lucide-react";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";

const ICON_BY_TO: Record<string, ComponentType<{ className?: string }>> = {
  "/study/today": SparklesIcon,
  "/study/srs": RepeatIcon,
  "/srs": LayersIcon,
  "/study/stats": ListChecksIcon,
  "/assignments": ClipboardListIcon,
  "/me/consult": MessageSquareIcon,
};
// to 와 정확히 다른 활성 매칭(예: 암기 카드 = /srs + /srs/stats).
const MATCH_BY_TO: Record<string, string[]> = {
  "/srs": ["/srs", "/srs/stats"],
};

// isStaff/features — 종합반 전용 항목(과제·상담) 노출 판정. 미전달 시 학생에겐 숨김(안전 기본).
export function StudyMgmtTabs({
  isStaff = false,
  features,
}: {
  isStaff?: boolean;
  features?: string[];
}) {
  const items: SectionTabItem[] = topbarDropdownItems(
    AREA_GROUP_IDS.manage,
    isStaff,
    features,
  ).map((link) => {
    const path = link.to.split("?")[0];
    return {
      id: path,
      to: link.to,
      label: link.label,
      icon: ICON_BY_TO[path],
      match: MATCH_BY_TO[path] ?? [path],
    };
  });
  return <AreaTabs ariaLabel="학습관리" items={items} />;
}

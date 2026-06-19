// 영역 eyebrow 표준 — [영역 아이콘] 영역명(한글). 모든 학생 영역 화면이 이 한 컴포넌트로 통일.
//   · 아이콘·라벨은 nav SSOT(NAV_GROUP_POOL)에서 파생 → 드롭다운·토글·eyebrow 가 항상 일치(드리프트 방지).
//   · 영어 캡션("LATEST ·" 등)·화면별 라벨·날짜 제각각이던 것을 영역명 하나로 수렴(2026-06 결정).
//   · 스타일은 공용 Eyebrow(ink-faint·mono·caps) — 화면 고유 정보(날짜 등)는 제목/설명으로 내린다.
import { NAV_GROUP_POOL, type NavGroupId } from "~/core/lib/nav-groups";

import { Eyebrow } from "./Eyebrow";

// eyebrow 로 영역을 대표하는 그룹 — 각 영역의 라벨·아이콘을 소유한 NAV_GROUP_POOL 그룹 id.
export type AreaKey = Extract<
  NavGroupId,
  "manage" | "aids" | "info" | "subjects" | "mock" | "community"
>;

export function AreaEyebrow({
  area,
  className,
}: {
  area: AreaKey;
  className?: string;
}) {
  const group = NAV_GROUP_POOL[area];
  const Icon = group.Icon;
  return (
    <Eyebrow className={className}>
      <Icon className="mr-1 inline size-3" />
      {group.label}
    </Eyebrow>
  );
}

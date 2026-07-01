// 영역 화면 토글 표준 래퍼 — 정책을 한 곳에 고정(드리프트 방지, 토글 내용 SSOT화와 같은 원리).
//   · 텍스트만: 아이콘·색 dot 제거(전 영역 동일).
//   · 최상단 sticky 고정: SectionTabs 기본 sticky.
//   · count 배지·badge·match 는 통과(학습지원 건수 등 유지).
// 4영역(학습관리·학습지원·학습정보·학습과목)이 모두 이 래퍼를 거쳐 동일 렌더.
// 향후 정책 변경(아이콘 on/off·sticky offset 등)은 여기 한 곳만 고치면 4영역 일괄 반영.

import { SectionTabs, type SectionTabItem } from "./SectionTabs";

export function AreaTabs({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: SectionTabItem[];
}) {
  // 정책: icon·dotClass 제거(텍스트만). 나머지(id·to·label·match·count·badge·disabled)는 유지.
  const textOnly: SectionTabItem[] = items.map((it) => ({
    id: it.id,
    to: it.to,
    label: it.label,
    match: it.match,
    count: it.count,
    badge: it.badge,
    disabled: it.disabled,
    disabledHint: it.disabledHint,
  }));
  return <SectionTabs ariaLabel={ariaLabel} items={textOnly} sticky />;
}

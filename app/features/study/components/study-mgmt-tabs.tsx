// 학습관리 영역 공용 탭 — 항상 보이는 가로 네비.
// 공용 `SectionTabs` 프리미티브 사용. 학습관리/지원/정보 3 영역과 동일 디자인 톤.
// 라벨은 학생 친화 (SRS·플래시카드 같은 학원 용어 미사용).

import {
  ClipboardListIcon,
  LayersIcon,
  ListChecksIcon,
  RepeatIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";

import { SectionTabs, type SectionTabItem } from "~/core/components/student";

// "알림" 은 상단 우측 종모양 벨(읽지 않은 수 배지 포함) 로 단일화 — 본 탭에서 제외.
const ITEMS: SectionTabItem[] = [
  {
    id: "today",
    to: "/study/today",
    label: "오늘 할 일",
    icon: SparklesIcon,
    match: ["/study/today"],
  },
  {
    id: "review",
    to: "/study/srs",
    label: "복습",
    icon: RepeatIcon,
    match: ["/study/srs"],
  },
  {
    id: "cards",
    to: "/srs",
    label: "암기 카드",
    icon: LayersIcon,
    match: ["/srs", "/srs/stats"],
  },
  {
    id: "goals",
    to: "/goals",
    label: "목표 · 진도",
    icon: TargetIcon,
    match: ["/goals"],
  },
  {
    id: "stats",
    to: "/study/stats",
    label: "학습 통계",
    icon: ListChecksIcon,
    match: ["/study/stats"],
  },
  {
    id: "assignments",
    to: "/assignments",
    label: "과제",
    icon: ClipboardListIcon,
    match: ["/assignments"],
  },
];

export function StudyMgmtTabs() {
  return <SectionTabs ariaLabel="학습관리" items={ITEMS} />;
}

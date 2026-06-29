// 학생 네비게이션 그룹 정의 — 데스크톱 사이드바·모바일 하단탭 공용.
//
// 구조: 풀(NAV_GROUP_POOL) + 디폴트(DEFAULT_CORE_TAB_IDS) + getter(getCoreTabIds).
// 향후 사용자 커스터마이징 시 getCoreTabIds() 만 user preference 로 교체.
//
// 위치 결정: 두 컴포넌트(StudentSidebar / 모바일 하단탭) 공유 — core/lib.
import {
  BarChart3Icon,
  BookOpenIcon,
  CalendarCheckIcon,
  HighlighterIcon,
  HomeIcon,
  NewspaperIcon,
  PenLineIcon,
  RotateCcwIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo } from "react";

export type NavLink = { label: string; to: string; meta?: string };
export type NavGroup = {
  // id 는 풀의 키 — 호출처에서 keyof typeof NAV_GROUP_POOL 로 narrow.
  id: string;
  label: string;
  Icon: typeof HomeIcon;
  items: NavLink[];
  // feat — 영역 잠금(🔒) 대상 area. 미지정 = 잠금 없음. 서버 영역 게이트가 권위, nav 는 시각 힌트.
  area?: string;
};

// 모든 nav 그룹 풀 — 핵심·가끔은 "어디 놓을지" 의 문제이고 그룹 정의는 여기 한 번.
export const NAV_GROUP_POOL = {
  today: {
    id: "today" as const,
    label: "오늘 할 일",
    Icon: CalendarCheckIcon,
    items: [{ label: "오늘 할 일", to: "/study/today" }],
    area: "area_study_mgmt",
  },
  review: {
    id: "review" as const,
    label: "복습·암기",
    Icon: RotateCcwIcon,
    items: [
      { label: "복습", to: "/study/srs" },
      { label: "암기 카드", to: "/srs" },
    ],
    area: "area_study_mgmt",
  },
  subjects: {
    id: "subjects" as const,
    label: "학습과목",
    Icon: BookOpenIcon,
    items: [], // 특별 — SUBJECT_NAV_ITEMS 로 별도 렌더
    area: "area_subjects",
  },
  aids: {
    id: "aids" as const,
    label: "학습지원",
    Icon: HighlighterIcon,
    items: [
      { label: "오답노트", to: "/study/wrong-note" },
      { label: "하이라이트", to: "/study/highlights" },
      { label: "즐겨찾기", to: "/study/bookmarks" },
      { label: "포스트잇", to: "/study/notes" },
      { label: "코멘트", to: "/study/comments" },
      // (Phase 5 진입 통합) AI Q&A 는 커뮤니티 "Q&A"(/qna)로 흡수 — AI 즉답+강사 확인.
    ],
    area: "area_study_aids",
  },
  manage: {
    id: "manage" as const,
    label: "학습관리",
    Icon: BarChart3Icon,
    items: [
      // feat — 학습 목표·진도 + 통계를 한 화면으로 통합(통폐합 3b). /goals 는 redirect.
      // OX 약점 진단도 "학습현황 > 정오문제 약점" 탭으로 흡수. 진입점 일원화.
      { label: "학습현황", to: "/study/stats" },
      { label: "과제", to: "/assignments" },
      { label: "상담", to: "/me/consult" },
    ],
    area: "area_study_mgmt",
  },
  info: {
    id: "info" as const,
    label: "학습정보",
    Icon: NewspaperIcon,
    items: [
      { label: "법 개정", to: "/latest/laws" },
      { label: "최근 판례", to: "/latest/cases" },
      { label: "1차 기출문제", to: "/latest/mcq?kind=past_exam" },
      { label: "2차 기출문제", to: "/latest/essay" },
      { label: "논문", to: "/latest/papers" },
      { label: "추록·정오표", to: "/latest/book-updates" },
      // 합격자 분석(추이·점수분포·선택과목) = 데이터. 합격 수기(서사)는 커뮤니티로 통합 —
      // 학습정보는 '분석', 커뮤니티는 '수기'로 역할 분리(중복 진입점 제거).
      { label: "합격자 분석", to: "/study/passer-trend" },
    ],
  },
  mock: {
    id: "mock" as const,
    label: "모의고사",
    Icon: PenLineIcon,
    items: [
      // 1차 모의는 통합(여러 교시 묶음 = mcq_exams)과 진도별(과목별 mock 팩)로 구분 — 진입점 분리.
      { label: "1차 통합 모의고사", to: "/latest/mcq/exams" },
      { label: "1차 진도별 모의고사", to: "/latest/mcq?kind=mock_progressive" },
      { label: "2차 모의고사 (온라인 GS)", to: "/gs" },
      { label: "GS 논점추출", to: "/gs/issues" },
      { label: "판례 쟁점훈련", to: "/case-training" },
      // 모의고사 그룹 = "시험 보기·훈련"만. 내 결과/기록은 다른 곳으로 편입(라우트·CTA 유지):
      //   응시 결과(실제 시험) → 대시보드 입력 허브 + /me/exam-results 전체관리.
      //   정오문제 응시 이력 → 학습현황 약점 탭(/study/stats?tab=ox_diagnosis) + /me/ox-sessions.
    ],
    area: "area_mock_exams",
  },
  community: {
    id: "community" as const,
    label: "커뮤니티",
    Icon: UsersIcon,
    items: [
      { label: "공지사항", to: "/announcements" },
      { label: "자유게시판", to: "/community/free" },
      { label: "스터디 모집", to: "/community/study" },
      { label: "반별 게시판", to: "/cohort-boards" },
      { label: "Q&A", to: "/qna" },
      { label: "합격 수기", to: "/community/review" },
    ],
  },
} satisfies Record<string, NavGroup>;

export type NavGroupId = keyof typeof NAV_GROUP_POOL;

// 영역별 그룹 구성 — 상단바 드롭다운과 화면 내 토글(SectionTabs)이 공유하는 단일 소스.
// 토글을 이 구성에서 파생하면(topbarDropdownItems) 드롭다운과 항상 일치 → 드리프트 불가.
// (과거: 토글이 항목을 하드코딩해 드롭다운과 어긋남 — 학습관리 상담 코멘트·학습지원 AI Q&A·학습정보 합격자 분석 누락.)
export const AREA_GROUP_IDS = {
  manage: ["today", "review", "manage"],
  aids: ["aids"],
  info: ["info"],
  mock: ["mock"],
  community: ["community"],
} as const satisfies Record<string, ReadonlyArray<NavGroupId>>;

// feat — 영역 잠금(🔒) 판정. 상단바·사이드바·하단탭 공용(표면 일관).
//   staff 면제, features 미산정(undefined=로딩) 시 미표시(깜빡임 방지), area 없으면 잠금 없음.
//   ★ 서버 영역 게이트 layout(study-management.layout 등)이 권위 — 이건 시각 힌트만.
export function isAreaLocked(
  area: string | undefined,
  isStaff: boolean,
  features: string[] | undefined,
): boolean {
  return (
    !isStaff &&
    features !== undefined &&
    area !== undefined &&
    !features.includes(area)
  );
}

// feat-8-008 — 영역 잠금 시각 표시 = 흐림(dim)으로 통일(자물쇠 아이콘 폐기).
//   상단바·사이드바·하단탭 공용 단일 소스. ★클릭 동작·서버 게이트는 그대로 —
//   시각만 흐리게 해 "잠긴 입구가 보이되 거슬리지 않는" 수준(투명도 낮춤). 잠긴
//   메뉴도 그대로 눌러 구독 안내로 진입(disabled 아님 — 구독 유도 기회 유지).
export const LOCKED_DIM_CLASS = "opacity-50";
// 흐림만으론 의미 전달이 약해 hover/focus 툴팁으로 보완(제거된 aria-label 대체).
export const LOCKED_HINT = "구독 시 이용 가능";

// 상단바 표면 매핑 — 6 드롭다운을 풀 그룹 조합으로 정의(SSOT 단일 소비).
//   순서·구성은 현행 상단바와 동일. subjects 는 SUBJECT_NAV_ITEMS 로 별도 렌더.
export const TOPBAR_DROPDOWNS: ReadonlyArray<{
  label: string;
  groupIds?: ReadonlyArray<NavGroupId>;
  subjects?: boolean;
  area?: string;
}> = [
  {
    label: "학습관리",
    groupIds: AREA_GROUP_IDS.manage,
    area: "area_study_mgmt",
  },
  { label: "학습과목", subjects: true, area: "area_subjects" },
  { label: "학습지원", groupIds: AREA_GROUP_IDS.aids, area: "area_study_aids" },
  { label: "학습정보", groupIds: AREA_GROUP_IDS.info },
  { label: "모의고사", groupIds: AREA_GROUP_IDS.mock, area: "area_mock_exams" },
  { label: "커뮤니티", groupIds: AREA_GROUP_IDS.community },
];

// 상단바 드롭다운 항목 = 구성 그룹들의 items 평탄화(단일 소스 파생).
export function topbarDropdownItems(
  groupIds: ReadonlyArray<NavGroupId>,
): NavLink[] {
  return groupIds.flatMap((id) => NAV_GROUP_POOL[id].items);
}

// 화면 내 영역 토글(AreaTabs)용 항목 — 드롭다운 항목을 SectionTabItem 모양으로 변환.
//   match 는 query 를 떼어낸 path(SectionTabs 활성 판정은 pathname 기준 + 최장 매칭).
//   반환 타입은 plain 객체 — core/lib 가 components 의 SectionTabItem 타입에 의존(역방향 import)하지
//   않도록. 구조상 SectionTabItem 에 그대로 대입 가능. mock.layout·McqAreaShell 가 공유(드리프트 방지).
export function areaTabItems(
  groupIds: ReadonlyArray<NavGroupId>,
): Array<{ id: string; to: string; label: string; match: string[] }> {
  return topbarDropdownItems(groupIds).map((link) => {
    const path = link.to.split("?")[0];
    return { id: path, to: link.to, label: link.label, match: [path] };
  });
}

// 디폴트 핵심 4탭 — user preference 가 없을 때 fallback.
export const DEFAULT_CORE_TAB_IDS = [
  "today",
  "review",
  "subjects",
  "aids",
] as const satisfies ReadonlyArray<NavGroupId>;

/**
 * 핵심 탭 id 반환.
 *
 * FUTURE: user preference 로 교체 가능.
 *   - loader 에서 user_nav_prefs row 조회 → 결과 id 검증 → 반환
 *   - 결과 없으면 DEFAULT_CORE_TAB_IDS 반환
 * 지금은 default 고정 — 동작은 하드코딩과 동일.
 */
export function getCoreTabIds(): ReadonlyArray<NavGroupId> {
  return DEFAULT_CORE_TAB_IDS;
}

/**
 * { core, secondary } 분리 — 풀에서 핵심 빼면 나머지가 가끔.
 * 사이드바·하단탭은 이 함수만 호출해서 렌더.
 *
 * useMemo 로 stable reference — 호출처 useEffect/useMemo 의 deps 무한루프 방지.
 * getCoreTabIds() 가 user preference 로 교체될 때는 그 deps 도 추가 필요.
 */
export function useNavLayout(): { core: NavGroup[]; secondary: NavGroup[] } {
  return useMemo(() => {
    const coreIds = getCoreTabIds();
    const coreSet = new Set<NavGroupId>(coreIds);
    const core = coreIds.map((id) => NAV_GROUP_POOL[id]);
    const secondary = (Object.keys(NAV_GROUP_POOL) as NavGroupId[])
      .filter((id) => !coreSet.has(id))
      .map((id) => NAV_GROUP_POOL[id]);
    return { core, secondary };
  }, []);
}

// Flat — 그룹이 아니라 단일 link.
export const FLAT_HOME = {
  label: "대시보드",
  to: "/dashboard",
  Icon: HomeIcon,
};
export const FLAT_ADMIN = {
  label: "운영관리",
  to: "/admin",
  Icon: SettingsIcon,
};

// 모바일 탭은 라벨이 짧아야 — 핵심 그룹의 모바일 단축 라벨 매핑.
// 매핑 없으면 group.label 폴백.
export const MOBILE_TAB_LABELS: Partial<Record<NavGroupId, string>> = {
  today: "오늘",
  review: "복습",
  subjects: "과목",
  aids: "지원",
  manage: "관리",
  info: "정보",
  mock: "모의",
  community: "커뮤니티",
};

/**
 * 한 그룹 안에서 active 로 표시할 to 1 개 선택 — "가장 긴 매칭 우선".
 *
 * 같은 그룹에 prefix 관계 항목이 있으면(예: /gs vs /gs/issues), 단순 isNavActive
 * 만으로는 두 항목이 동시에 활성으로 표시돼 "현재 위치 모름" 문제가 생긴다.
 * 호출처는 그룹별로 이 함수로 winner 를 1 개 정한 뒤 그것과만 비교한다.
 */
export function pickActiveLinkTo(
  items: ReadonlyArray<{ to: string }>,
  pathname: string,
  search: string,
): string | null {
  let bestTo: string | null = null;
  let bestLen = -1;
  for (const it of items) {
    if (!isNavActive(it.to, pathname, search)) continue;
    const len = it.to.length;
    if (len > bestLen) {
      bestLen = len;
      bestTo = it.to;
    }
  }
  return bestTo;
}

/**
 * 현재 경로(pathname + search)가 nav link 의 `to` 와 매칭되는지.
 *   - to 에 query 가 있으면: pathname 정확 일치 + search 의 그 쿼리 키-값 포함
 *   - to 에 query 가 없으면: pathname 정확 일치 또는 그 prefix 의 자식 경로
 *
 * 주의: prefix 매칭이라 같은 그룹 내 prefix 관계 항목 2 개가 동시에 true 가 될
 * 수 있다 — 개별 link 의 active 표시는 isNavActive 직접 호출 대신
 * pickActiveLinkTo 로 그룹 winner 를 정한 뒤 그것과만 비교할 것.
 */
export function isNavActive(
  to: string,
  pathname: string,
  search: string,
): boolean {
  const [toPath, toQuery] = to.split("?");
  if (toQuery) {
    if (pathname !== toPath) return false;
    const sp = new URLSearchParams(search);
    const target = new URLSearchParams(toQuery);
    for (const [k, v] of target.entries()) {
      if (sp.get(k) !== v) return false;
    }
    return true;
  }
  if (pathname === toPath) return true;
  if (pathname.startsWith(toPath + "/")) return true;
  return false;
}

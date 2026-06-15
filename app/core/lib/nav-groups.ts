// 학생 네비게이션 그룹 정의 — 데스크톱 사이드바·모바일 하단탭 공용.
//
// 구조: 풀(NAV_GROUP_POOL) + 디폴트(DEFAULT_CORE_TAB_IDS) + getter(getCoreTabIds).
// 향후 사용자 커스터마이징 시 getCoreTabIds() 만 user preference 로 교체.
//
// 위치 결정: 두 컴포넌트(StudentSidebar / 모바일 하단탭) 공유 — core/lib.

import { useMemo } from "react";
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

export type NavLink = { label: string; to: string; meta?: string };
export type NavGroup = {
  // id 는 풀의 키 — 호출처에서 keyof typeof NAV_GROUP_POOL 로 narrow.
  id: string;
  label: string;
  Icon: typeof HomeIcon;
  items: NavLink[];
};

// 모든 nav 그룹 풀 — 핵심·가끔은 "어디 놓을지" 의 문제이고 그룹 정의는 여기 한 번.
export const NAV_GROUP_POOL = {
  today: {
    id: "today" as const,
    label: "오늘 할 일",
    Icon: CalendarCheckIcon,
    items: [{ label: "오늘 할 일", to: "/study/today" }],
  },
  review: {
    id: "review" as const,
    label: "복습",
    Icon: RotateCcwIcon,
    items: [
      { label: "복습", to: "/study/srs" },
      { label: "카드 암기", to: "/srs" },
    ],
  },
  subjects: {
    id: "subjects" as const,
    label: "학습과목",
    Icon: BookOpenIcon,
    items: [], // 특별 — SUBJECT_SECTIONS 로 별도 렌더
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
      { label: "메모", to: "/study/comments" },
      { label: "AI Q&A", to: "/ai" },
    ],
  },
  manage: {
    id: "manage" as const,
    label: "학습관리",
    Icon: BarChart3Icon,
    items: [
      { label: "학습 목표 · 진도", to: "/goals" },
      { label: "학습 통계", to: "/study/stats" },
      { label: "과제", to: "/assignments" },
      { label: "상담 코멘트", to: "/me/consult" },
      { label: "정오문제 응시 이력", to: "/me/ox-sessions" },
    ],
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
    ],
  },
  mock: {
    id: "mock" as const,
    label: "모의고사",
    Icon: PenLineIcon,
    items: [
      { label: "1차 모의고사", to: "/latest/mcq?kind=mock" },
      { label: "2차 모의고사 (온라인 GS)", to: "/gs" },
      { label: "GS 논점추출", to: "/gs/issues" },
      { label: "판례 쟁점훈련", to: "/case-training" },
      { label: "응시 결과", to: "/me/exam-results" },
    ],
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
      { label: "합격 후기", to: "/community/review" },
    ],
  },
} satisfies Record<string, NavGroup>;

export type NavGroupId = keyof typeof NAV_GROUP_POOL;

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

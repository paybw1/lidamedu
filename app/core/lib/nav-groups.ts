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
  GraduationCapIcon,
  HighlighterIcon,
  HomeIcon,
  ListChecksIcon,
  NewspaperIcon,
  PenLineIcon,
  RotateCcwIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo } from "react";

// staffOnly: 학생에게 숨기고 staff(강사·관리자·원장)에게만 노출. 오픈 준비 중 기능 임시 숨김용.
// feature: 이 기능 플래그(getMembershipAccess features)가 있는 학생에게만 노출(staff 면제).
//   종합반 전용 항목(상담·과제·반별 게시판) 숨김용 — 서버/RLS 가 권위, nav 는 노출 제어.
export type NavLink = {
  label: string;
  to: string;
  meta?: string;
  staffOnly?: boolean;
  feature?: string;
};
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
    label: "학습노트",
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
      // 과제·상담 = 종합반 전용 → cohort 그룹(종합반 드롭다운)으로 이동. 여기서 제거.
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
      // 기출문제 = 1차/2차 통합 진입점(화면 상단 토글로 구분, 기본 1차).
      { label: "기출문제", to: "/latest/mcq?kind=past_exam" },
      // 논문·합격자 분석 = 오픈 준비 중 → 학생 숨김, staff 만 노출(staffOnly).
      { label: "논문", to: "/latest/papers", staffOnly: true },
      // errata Phase 4a — 교재별 누적 PDF 목록으로 교체(舊 book-updates 화면 대체).
      { label: "추록·정오표", to: "/study/errata" },
      // 합격자 분석(추이·점수분포·선택과목) = 데이터. 합격 수기(서사)는 커뮤니티로 통합 —
      // 학습정보는 '분석', 커뮤니티는 '수기'로 역할 분리(중복 진입점 제거).
      { label: "합격자 분석", to: "/study/passer-trend", staffOnly: true },
    ],
  },
  // 모의고사 = 1차(객관식)·2차(주관식) 두 그룹으로 분리 — 각 그룹이 화면 내 토글(AreaTabs)의
  // SSOT. 상단바 드롭다운은 단일 "모의고사"로 두 그룹을 합쳐 표시(TOPBAR_DROPDOWNS), 사이드바·
  // 하단탭은 그룹별로 갈린다. 화면 토글은 자기 라운드 그룹만 표시(mock.layout 이 경로로 분기).
  mock1: {
    id: "mock1" as const,
    label: "1차 모의고사",
    Icon: ListChecksIcon,
    items: [
      // 통합(여러 교시 묶음 = mcq_exams)과 진도별(과목별 mock 팩)로 구분 — 진입점 분리.
      { label: "통합 모의고사", to: "/latest/mcq/exams" },
      // 진도별 모의고사 = 종합반 전용(feat-2-031) — 개인 nav(사이드바·하단탭)에서 숨김.
      //   접근 권위는 서버(mcq loader·pack detail·start 의 isCohortAccess 게이트).
      {
        label: "진도별 모의고사",
        to: "/latest/mcq?kind=mock_progressive",
        feature: "cohort_curriculum",
      },
    ],
    area: "area_mock_exams",
  },
  mock2: {
    id: "mock2" as const,
    label: "2차 모의고사",
    Icon: PenLineIcon,
    items: [
      // 훈련 순서(논점 도출 → 목차 구성 → 답안 서술)대로 배치. 용어 통일:
      //   논점추출(구 GS 논점추출)·목차잡기(구 쟁점·목차 훈련)·답안작성(구 온라인 GS).
      { label: "논점추출", to: "/gs/issues" },
      { label: "목차잡기", to: "/case-training" },
      { label: "답안작성", to: "/gs" },
      // 모의고사 그룹 = "시험 보기·훈련"만. 내 결과/기록은 다른 곳으로 편입(라우트·CTA 유지):
      //   응시 결과(실제 시험) → 대시보드 입력 허브 + /me/exam-results 전체관리.
      //   정오문제 응시 이력 → 학습현황 약점 탭(/study/stats?tab=ox_diagnosis) + /me/ox-sessions.
    ],
    area: "area_mock_exams",
  },
  // 종합반(cohort) 전용 통합 그룹 — 흩어져 있던 반별 게시판·과제·상담을 여기로 모으고,
  //   종합반 학생이 쓰는 1차·2차 모의고사 진입도 함께 담는다. 이 그룹은 종합반 접근자
  //   (hasCohortAccess: staff 또는 cohort_curriculum·one_on_one_consult 보유)에게만 노출되며,
  //   그 경우 상단바에서 '모의고사' 드롭다운을 대체(getTopbarDropdowns)하고 사이드바·하단탭에서
  //   mock1·mock2 그룹을 숨긴다(useNavLayout). 모의 링크는 area 잠금이 없으나 실제 접근은
  //   mock.layout requireFeature(area_mock_exams)가 서버 권위 — nav 는 진입점만 제공.
  cohort: {
    id: "cohort" as const,
    label: "종합반",
    Icon: GraduationCapIcon,
    items: [
      { label: "반별 게시판", to: "/cohort-boards", feature: "cohort_curriculum" },
      { label: "과제", to: "/assignments", feature: "cohort_curriculum" },
      // Phase 3 — 월간 학습계획 (작성·제출·승인 확인) + 일일 기록.
      { label: "월간 계획", to: "/study/plan", feature: "cohort_curriculum" },
      { label: "오늘 기록", to: "/study/plan/log", feature: "cohort_curriculum" },
      { label: "상담", to: "/me/consult", feature: "one_on_one_consult" },
      { label: "1차 모의고사", to: "/latest/mcq/exams" },
      { label: "2차 모의고사", to: "/gs/issues" },
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
      // 반별 게시판 = 종합반 전용 → cohort 그룹(종합반 드롭다운)으로 이동. 여기서 제거.
      { label: "Q&A", to: "/qna" },
      { label: "합격 수기", to: "/community/review" },
      // 이용 가이드 허브 — 기능 사용법(글+영상). 운영자 작성(/admin/guides).
      { label: "이용 가이드", to: "/guide" },
      // 고객센터는 강의 플랫폼 nav(LECTURE_NAV_LINKS)로 이동(feat-6-011).
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
  mock1: ["mock1"],
  mock2: ["mock2"],
  cohort: ["cohort"],
  community: ["community"],
} as const satisfies Record<string, ReadonlyArray<NavGroupId>>;

// 종합반(cohort) 표면 노출 판정 — staff 이거나 종합반 기능 플래그를 하나라도 보유한 학생.
//   true 면 상단바 '모의고사' 드롭다운이 '종합반'으로 교체되고(getTopbarDropdowns),
//   사이드바·하단탭에서 mock1·mock2 그룹이 숨겨지며 cohort 그룹이 노출된다(useNavLayout).
//   ★서버 게이트(각 화면 requireFeature)가 접근 권위 — 이건 nav 노출 제어만.
export function hasCohortAccess(
  isStaff: boolean,
  features?: string[],
): boolean {
  if (isStaff) return true;
  if (!features) return false;
  return (
    features.includes("cohort_curriculum") ||
    features.includes("one_on_one_consult")
  );
}

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

// feat-8-008/8-027 — 권한 없는 항목 = 비활성(disabled) 표시로 통일(자물쇠 아이콘 폐기).
//   상단바·사이드바·하단탭 공용 단일 소스. ★흐림(opacity) + 클릭 불가(pointer-events-none)
//   로 "비활성" 상태를 명확히 한다(서버 게이트가 권위 — 이건 시각·상호작용 힌트).
export const LOCKED_DIM_CLASS =
  "pointer-events-none opacity-45 cursor-not-allowed";
// 비활성 사유 툴팁(제거된 aria-label 대체). pointer-events-none 라 부모에 걸어 힌트 유지.
export const LOCKED_HINT = "구독 시 이용 가능";

// 콘텐츠 고도화 전 학생 비활성 과목 — 등급·구매 여부와 무관하게 학생에게 잠금(staff 만 접근).
//   현재 학생 노출 허용 = 특허법·자연과학뿐. 나머지는 준비되는 대로 여기서 제거.
export const STUDENT_DISABLED_SUBJECTS: ReadonlyArray<string> = [
  "trademark",
  "design",
  "civil",
  "civil-procedure",
];
// 준비 중 과목 가운데 강사 전원(담당 과목 무관)에게 열람을 여는 과목(원장 지시 2026-07-07).
//   쓰기 게이트(assertSubjectWritable=담당 과목)는 별개로 유지.
export const STAFF_OPEN_PREPARING_SUBJECTS: ReadonlyArray<string> = [
  "trademark",
  "design",
  "civil",
];
// 준비 중 과목 가운데 종합반(cohort) 수험생에게 여는 과목(원장 지시 2026-07-18).
//   판정: 학생 중 subjects === 'all' 은 종합반뿐(membership 리졸버 불변식) — 별도
//   등급 prop 없이 subjects 로 구분한다. 서버 권위는 subjects.layout(grade 직접 확인).
export const COHORT_OPEN_PREPARING_SUBJECTS: ReadonlyArray<string> = ["civil"];
export const PREPARING_HINT = "준비 중";
export const COHORT_ONLY_HINT = "종합반 전용";

// 학생에게 잠긴 준비 중 과목 목록 — 등급별(staff=없음, 종합반=개방 과목 제외).
//   SRS 큐 제외 등 "목록에서 숨김" 소비처 공용.
export function studentDisabledSubjectsFor(
  grade: string | undefined,
): ReadonlyArray<string> {
  if (grade === "staff") return [];
  if (grade === "cohort")
    return STUDENT_DISABLED_SUBJECTS.filter(
      (s) => !COHORT_OPEN_PREPARING_SUBJECTS.includes(s),
    );
  return STUDENT_DISABLED_SUBJECTS;
}

// feat-8-027 — 학습과목 내 개별 과목 잠금 판정(체험=특허법만, 자기학습=결제 과목 등).
//   subjects='all' 또는 slug 포함 시 미잠금. staff 면제, 미산정(undefined) 시 미표시(로딩).
//   ★준비 중 과목(STUDENT_DISABLED_SUBJECTS)은 등급 무관하게 학생 잠금.
//   ★준비 중 과목의 staff 접근은 세분화(feat-7-041): admin/manager=전체("all"),
//     instructor=담당 과목(instructor_subjects)만. staffPreparing 미전달 시 기존대로 staff 전체 허용.
export function isSubjectLocked(
  slug: string,
  isStaff: boolean,
  subjects: "all" | string[] | undefined,
  staffPreparing?: "all" | string[],
): boolean {
  if (isStaff) {
    if (!STUDENT_DISABLED_SUBJECTS.includes(slug)) return false;
    if (STAFF_OPEN_PREPARING_SUBJECTS.includes(slug)) return false;
    if (staffPreparing === undefined || staffPreparing === "all") return false;
    return !staffPreparing.includes(slug);
  }
  if (STUDENT_DISABLED_SUBJECTS.includes(slug)) {
    // 종합반 개방 과목 — 학생 중 subjects='all' 은 종합반뿐이라 이것으로 판정.
    if (
      COHORT_OPEN_PREPARING_SUBJECTS.includes(slug) &&
      subjects === "all"
    )
      return false;
    return true;
  }
  if (subjects === undefined || subjects === "all") return false;
  return !subjects.includes(slug);
}

// 과목 비활성 사유 힌트 — 준비 중 과목은 구독과 무관하므로 문구를 구분.
//   staff(강사)에게 잠긴 준비 중 과목은 담당 과목 미지정이 사유.
//   종합반 개방 과목이 잠겨 보이는 학생 = 비종합반 → "종합반 전용".
export function subjectLockedHint(slug: string, isStaff = false): string {
  if (STUDENT_DISABLED_SUBJECTS.includes(slug)) {
    if (isStaff) return "담당 과목 아님";
    return COHORT_OPEN_PREPARING_SUBJECTS.includes(slug)
      ? COHORT_ONLY_HINT
      : PREPARING_HINT;
  }
  return LOCKED_HINT;
}

// 상단바 표면 매핑 — 6 드롭다운을 풀 그룹 조합으로 정의(SSOT 단일 소비).
//   순서·구성은 현행 상단바와 동일. subjects 는 SUBJECT_NAV_ITEMS 로 별도 렌더.
export const TOPBAR_DROPDOWNS: ReadonlyArray<{
  label: string;
  groupIds?: ReadonlyArray<NavGroupId>;
  subjects?: boolean;
  area?: string;
  // groupLinks — 그룹 items 를 펼치지 않고 그룹 1개당 링크 1개(그룹명 → 첫 항목)로 렌더.
  //   모의고사: '모의고사 ▾' 안에 1차/2차 라운드 링크 2개만. 진입하면 화면 토글이 세부 항목 제공.
  groupLinks?: boolean;
}> = [
  {
    label: "학습관리",
    groupIds: AREA_GROUP_IDS.manage,
    area: "area_study_mgmt",
  },
  { label: "학습과목", subjects: true, area: "area_subjects" },
  { label: "학습노트", groupIds: AREA_GROUP_IDS.aids, area: "area_study_aids" },
  { label: "학습정보", groupIds: AREA_GROUP_IDS.info },
  // 모의고사 = 단일 드롭다운. 항목은 라운드 2개(1차·2차)뿐 — groupLinks 로 그룹명 링크만.
  //   1차 클릭 → 통합 모의 색인(통합/진도별 토글) · 2차 클릭 → 논점추출(논점추출/목차잡기/답안작성 토글).
  {
    label: "모의고사",
    groupIds: [...AREA_GROUP_IDS.mock1, ...AREA_GROUP_IDS.mock2],
    area: "area_mock_exams",
    groupLinks: true,
  },
  { label: "커뮤니티", groupIds: AREA_GROUP_IDS.community },
];

// 종합반 접근자용 상단바 드롭다운 — '모의고사' 슬롯을 대체한다.
//   항목 = cohort 그룹(반별 게시판·과제·상담·1차 모의·2차 모의). area 잠금 없음(접근자에게만 노출).
const COHORT_TOPBAR_DROPDOWN: (typeof TOPBAR_DROPDOWNS)[number] = {
  label: "종합반",
  groupIds: AREA_GROUP_IDS.cohort,
};

// 역할별 상단바 드롭다운 목록 — 종합반 접근자는 '모의고사'를 '종합반'으로 교체(폭 증가 없음).
//   비종합반은 현행 그대로. 상단바는 이 함수 결과를 map 한다(정적 TOPBAR_DROPDOWNS 직접 사용 금지).
export function getTopbarDropdowns(
  isStaff: boolean,
  features?: string[],
): typeof TOPBAR_DROPDOWNS {
  if (!hasCohortAccess(isStaff, features)) return TOPBAR_DROPDOWNS;
  return TOPBAR_DROPDOWNS.map((d) =>
    d.label === "모의고사" ? COHORT_TOPBAR_DROPDOWN : d,
  );
}

// staffOnly 항목은 학생에게 숨김(staff 는 전부). isStaff 미지정 시 전부 노출(안전 기본).
// feature 항목은 해당 기능 플래그 보유 학생에게만(staff 면제) — features 미전달(미산정 포함) 시 숨김.
export function visibleItems(
  items: NavLink[],
  isStaff: boolean,
  features?: string[],
): NavLink[] {
  return items.filter((i) => {
    if (isStaff) return true;
    if (i.staffOnly) return false;
    if (i.feature) return (features ?? []).includes(i.feature);
    return true;
  });
}

// 상단바 드롭다운 항목 = 구성 그룹들의 items 평탄화(단일 소스 파생).
//   isStaff 지정 시 staffOnly 항목을 학생에게서 필터(기본 true = 전부, 하위호환).
export function topbarDropdownItems(
  groupIds: ReadonlyArray<NavGroupId>,
  isStaff: boolean = true,
  features?: string[],
): NavLink[] {
  return groupIds.flatMap((id) =>
    visibleItems([...NAV_GROUP_POOL[id].items], isStaff, features),
  );
}

// 그룹명 링크 — items 를 펼치지 않고 그룹 1개당 링크 1개(그룹명 → 첫 표시 항목).
//   모의고사 드롭다운(groupLinks)이 사용: 1차 모의고사·2차 모의고사 2개만 노출하고,
//   세부(통합/진도별, 논점추출/목차잡기/답안작성)는 진입 후 화면 토글이 제공.
//   표시 항목이 하나도 없는 그룹은 링크 생성 안 함(권한 필터 결과 빈 그룹 방지).
export function topbarGroupLinks(
  groupIds: ReadonlyArray<NavGroupId>,
  isStaff: boolean = true,
  features?: string[],
): NavLink[] {
  return groupIds.flatMap((id) => {
    const g = NAV_GROUP_POOL[id];
    const items = visibleItems([...g.items], isStaff, features);
    if (items.length === 0) return [];
    return [{ label: g.label, to: items[0].to }];
  });
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
export function useNavLayout(
  isStaff: boolean = true,
  features?: string[],
): {
  core: NavGroup[];
  secondary: NavGroup[];
} {
  // features 배열 identity 가 렌더마다 바뀌어도 내용이 같으면 재계산하지 않도록 키로 직렬화.
  const featureKey = features ? features.join("|") : null;
  return useMemo(() => {
    const cohort = hasCohortAccess(isStaff, features);
    // 종합반 접근자: 모의고사(mock1·mock2)는 종합반 그룹으로 흡수 → 개별 표시 제외.
    //   비종합반: 종합반 그룹 자체 제외(모의 링크가 feature 무관이라 필터로는 안 사라짐).
    const excluded = new Set<NavGroupId>(
      cohort ? ["mock1", "mock2"] : ["cohort"],
    );
    const coreIds = getCoreTabIds();
    const coreSet = new Set<NavGroupId>(coreIds);
    // staffOnly·feature 항목을 학생에게서 필터(오픈 준비 중·종합반 전용 숨김). staff 는 전부.
    const withVisible = (id: NavGroupId): NavGroup => {
      const g = NAV_GROUP_POOL[id];
      return { ...g, items: visibleItems([...g.items], isStaff, features) };
    };
    const core = coreIds.map(withVisible);
    const secondary = (Object.keys(NAV_GROUP_POOL) as NavGroupId[])
      .filter((id) => !coreSet.has(id) && !excluded.has(id))
      .map(withVisible)
      // subjects 는 items=[](특별 렌더)라 예외. 그 외 표시 항목이 0 인 그룹은 숨김.
      .filter((g) => g.id === "subjects" || g.items.length > 0);
    return { core, secondary };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, featureKey]);
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
  mock1: "1차 모의",
  mock2: "2차 모의",
  cohort: "종합반",
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

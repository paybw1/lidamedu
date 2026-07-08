// 두 제품 플랫폼(학습·강의) 정의 — 상단 브랜드 옆 세그먼트 스위처가 공유하는 단일 소스.
//   학습 플랫폼 = 조문·판례·문제·학습관리(기존, navigation.layout).
//   강의 플랫폼 = 영상 강의 수강 + 도서(신규 lecture.layout, feat-11).
// 활성 플랫폼은 URL 이 권위 — 별도 상태·쿠키 없음(pathname 으로 판별).

export type PlatformId = "study" | "lecture";

export interface PlatformDef {
  id: PlatformId;
  label: string;
  // 스위처 클릭 시 이동할 홈. 학습=대시보드(인증 랜딩), 강의=내 강의실.
  home: string;
}

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  study: { id: "study", label: "학습 플랫폼", home: "/dashboard" },
  lecture: { id: "lecture", label: "강의 플랫폼", home: "/lecture" },
};

export const PLATFORM_ORDER: PlatformId[] = ["study", "lecture"];

// 강의 플랫폼 소속 경로 판별. ★"/lectures/:itemId"(학습 플랫폼의 콘텐츠 연결 영상)와
// "/lecture-note"(구 강의노트)는 세그먼트가 달라 매칭되지 않는다 — 정확히 "/lecture" 및
// 그 자식만 강의 플랫폼.
export function getActivePlatform(pathname: string): PlatformId {
  if (pathname === "/lecture" || pathname.startsWith("/lecture/")) {
    return "lecture";
  }
  return "study";
}

// 강의 플랫폼 상단 네비 링크(단일 소스). S1 = 내 강의실 + 강의 카탈로그.
//   (주문·배송·도서몰은 후속 단계에서 lecture 네임스페이스로 이관하며 추가.)
export const LECTURE_NAV_LINKS: ReadonlyArray<{ label: string; to: string }> = [
  { label: "내 강의실", to: "/lecture" },
  { label: "강의 카탈로그", to: "/lecture/catalog" },
];

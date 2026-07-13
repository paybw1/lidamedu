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
  // 강의 플랫폼 진입 = 랜딩(/lecture/home). 수강현황(내 강의실)은 마이페이지 하위.
  lecture: { id: "lecture", label: "강의 플랫폼", home: "/lecture/home" },
};

export const PLATFORM_ORDER: PlatformId[] = ["lecture", "study"];

// 강의 플랫폼 소속 경로 판별. ★"/lectures/:itemId"(학습 플랫폼의 콘텐츠 연결 영상)와
// "/lecture-note"(구 강의노트)는 세그먼트가 달라 매칭되지 않는다 — 정확히 "/lecture" 및
// 그 자식만 강의 플랫폼.
export function getActivePlatform(pathname: string): PlatformId {
  if (pathname === "/lecture" || pathname.startsWith("/lecture/")) {
    return "lecture";
  }
  // 리담안내(인사말·강사진·찾아오시는 길)는 강의 플랫폼 소속 — 강의 nav "리담안내"에서
  // 진입 시 학습 플랫폼으로 튕기지 않도록 강의로 판별(lecture.layout 아래 렌더).
  if (
    pathname === "/about" ||
    pathname.startsWith("/about/") ||
    pathname === "/location"
  ) {
    return "lecture";
  }
  return "study";
}

// 강의 플랫폼 상단 네비 링크(단일 소스).
//   도서는 강의 상품에 부속돼 판매·배송되므로(standalone 도서몰 없음), 배송 현황은
//   주문·배송에서 확인. 별도 도서몰 메뉴는 두지 않는다.
// 강의 플랫폼 상단 네비. children 이 있으면 hover 드롭다운(마이페이지 등).
export type LectureNavItem = {
  label: string;
  to?: string;
  children?: ReadonlyArray<{ label: string; to: string }>;
};
export const LECTURE_NAV_LINKS: ReadonlyArray<LectureNavItem> = [
  {
    label: "리담안내",
    children: [
      { label: "인사말", to: "/about" },
      { label: "강사소개", to: "/about/instructors" },
      { label: "시험정보", to: "/lecture/exam-info" },
      { label: "리담소식", to: "/lecture/news" },
      { label: "학원시설", to: "/lecture/facilities" },
      { label: "찾아오시는 길", to: "/location" },
    ],
  },
  { label: "수강신청", to: "/lecture/catalog" },
  { label: "도서구입", to: "/lecture/books" },
  { label: "고객센터", to: "/lecture/support" },
  {
    label: "마이페이지",
    children: [
      { label: "수강현황", to: "/lecture" },
      { label: "주문·배송", to: "/lecture/orders" },
      { label: "증명서 발급", to: "/lecture/certificates" },
      { label: "결제내역 조회", to: "/lecture/payments" },
      { label: "쿠폰 관리", to: "/lecture/coupons" },
      { label: "포인트 관리", to: "/lecture/points" },
    ],
  },
];

// 드롭다운 활성 판별 — 자식 경로 중 하나와 현재 경로 일치.
// "/lecture" 는 형제(수강신청·도서 등)가 /lecture/* 라 정확일치만.
export function childMatchesPath(to: string, pathname: string): boolean {
  if (to === "/lecture") return pathname === "/lecture";
  return pathname === to || pathname.startsWith(to + "/");
}

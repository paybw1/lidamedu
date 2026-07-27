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
  // 상단 스위처 라벨은 짧게(강의/학습) — 바 공간 절약.
  study: { id: "study", label: "학습", home: "/dashboard" },
  // 강의 플랫폼 진입 = 랜딩(/lecture/home). 수강현황(내 강의실)은 마이페이지 하위.
  lecture: { id: "lecture", label: "강의", home: "/lecture/home" },
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

// 운영관리(/admin)·인박스(/inbox) 등은 두 플랫폼 공용 운영 영역 — 특정 제품이 아니다.
// 스위처에서 어느 플랫폼도 활성 표시하지 않아, 강의 플랫폼에서 진입해도 학습 플랫폼으로
// '전환된 것처럼' 보이지 않게 한다.
export function isPlatformNeutralPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/")
  );
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
// 리담안내 하위 6개 — 상단 드롭다운과 /about 섹션 sticky 서브내비가 공유(단일 소스).
export const LECTURE_GUIDE_LINKS: ReadonlyArray<{ label: string; to: string }> = [
  { label: "인사말", to: "/about" },
  { label: "강사소개", to: "/about/instructors" },
  { label: "시험정보", to: "/lecture/exam-info" },
  { label: "리담소식", to: "/lecture/news" },
  { label: "학원시설", to: "/lecture/facilities" },
  { label: "찾아오시는 길", to: "/location" },
];

// 마이페이지 하위 — 상단 드롭다운과 마이페이지 화면 sticky 서브내비가 공유(단일 소스).
export const LECTURE_MYPAGE_LINKS: ReadonlyArray<{ label: string; to: string }> =
  [
    { label: "수강현황", to: "/lecture" },
    { label: "주문·배송", to: "/lecture/orders" },
    { label: "증명서 발급", to: "/lecture/certificates" },
    { label: "결제내역 조회", to: "/lecture/payments" },
    { label: "쿠폰 관리", to: "/lecture/coupons" },
    { label: "포인트 관리", to: "/lecture/points" },
  ];

// 커뮤니티 하위 — 학습 플랫폼과 공유하는 게시판(자유·스터디·합격수기). 강의 플랫폼 상단바에서도
//   같은 커뮤니티로 진입한다(별도 게시판 신설 아님 = 단일 소스). 커뮤니티 화면은 인증 영역
//   (navigation.layout)에서 렌더되므로, 진입 시 학습 플랫폼 컨텍스트로 이동한다(공유 공간).
export const LECTURE_COMMUNITY_LINKS: ReadonlyArray<{
  label: string;
  to: string;
}> = [
  { label: "자유게시판", to: "/community/free" },
  { label: "스터디 모집", to: "/community/study" },
  { label: "합격 수기", to: "/community/review" },
];

export const LECTURE_NAV_LINKS: ReadonlyArray<LectureNavItem> = [
  {
    label: "리담안내",
    children: LECTURE_GUIDE_LINKS,
  },
  { label: "수강신청", to: "/lecture/catalog" },
  { label: "도서구입", to: "/lecture/books" },
  {
    label: "커뮤니티",
    children: LECTURE_COMMUNITY_LINKS,
  },
  { label: "고객센터", to: "/lecture/support" },
  {
    label: "마이페이지",
    children: LECTURE_MYPAGE_LINKS,
  },
];

// 드롭다운 활성 판별 — 자식 경로 중 하나와 현재 경로 일치.
// "/lecture" 는 형제(수강신청·도서 등)가 /lecture/* 라 정확일치만.
// "/about"(인사말)도 형제 "/about/instructors"(강사소개)를 삼키지 않도록 정확일치만 —
//   접두 매칭이면 강사소개 페이지에서 인사말이 함께 활성화된다.
export function childMatchesPath(to: string, pathname: string): boolean {
  if (to === "/lecture" || to === "/about") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

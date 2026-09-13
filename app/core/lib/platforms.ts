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

// ★현재 운영 중인 (구) 강의 플랫폼. 내부 강의 플랫폼(/lecture)은 개발 중이라 비-staff 는
//   전부 이 운영 사이트로 보낸다 — 스위처(platform-switch)와 lecture.layout 게이트가 공유.
export const EXTERNAL_LECTURE_URL = "https://lidamedu.com";

/**
 * 정본(canonical) 주소 — 검색엔진에 "이 화면의 진짜 주소는 여기"라고 알리는 값.
 * 사이트맵 · robots · 각 화면의 canonical·og:url 이 **전부 이 한 곳**을 본다.
 *
 * ★환경변수가 아니라 상수다 — meta 는 화면 전환 중에도 실행돼 process.env 를 못 읽는다.
 * ★끝에 슬래시를 붙이지 않는다. 붙으면 "//경로" 가 된다 — 2026-09-13 운영 사이트맵 7건과
 *   robots 의 Sitemap 줄이 정확히 그 상태였다(환경변수 SITE_URL 끝 슬래시 + 문자열 연결).
 * ★D4(주소 단일화)가 확정되면 **이 한 줄만** 바꾼다. 지금 값은 결정이 아니라 현재 운영
 *   중인 호스트를 그대로 적은 것이다(apex 는 www 로 넘어가고 www 가 200).
 */
export const CANONICAL_ORIGIN = "https://www.lidamipedu.com";

// ── 오픈 게이트 (feat-11-012 P0) ─────────────────────────────────────────────
// 종전에는 lecture.layout loader 안에 "로그인 안 했으면 튕김 / staff 아니면 튕김" 두 줄로
// 박혀 있었다. 그 두 줄이 **우연히** 학생 게이트 4종(단일 세션·승인·동의·필수정보)까지
// 가려 주고 있었다 — /lecture/* 는 최상위 레이아웃이라 private.layout 을 전혀 타지 않는다
// (routes.ts 의 lecture.layout 은 navigation.layout 과 형제다). 그래서 오픈은 "그 두 줄을
// 지우는 일"이 아니다. 게이트를 단계로 바꾸고, 그 뒤에 설 게이트를 먼저 세워 둔다.
//
//   closed — 강사·원장만(현재). 그 외는 어떤 딥링크로 들어와도 운영 사이트로.
//   public — 공개 화면은 누구나(비로그인 포함). 구매·마이페이지·강의실은 여전히 staff 만.
//   open   — 전원 개방. 로그인이 필요한 화면은 각자 판단한다.
//
// ★D3(게이트 범위)가 정해지면 **이 상수 하나만** 바꾼다.
export type LectureGateStage = "closed" | "public" | "open";
export const LECTURE_GATE_STAGE: LectureGateStage = "closed";

/**
 * 로그인 없이 열리는 강의 플랫폼 경로(단일 소스).
 *
 * ★이 목록 하나를 세 곳이 함께 읽는다 — 게이트(어디까지 여는가) · 사이트맵(무엇을 색인시키는가)
 *   · robots(무엇을 막는가). 세 곳이 갈라지면 "검색에는 떴는데 눌러 보니 로그인 벽"이 난다.
 *
 * 자식 경로는 접두로 함께 열린다(/lecture/news → /lecture/news/:id).
 * ★"/lecture" 정확일치는 **내 강의실**이라 이 목록에 없다 — 접두 매칭이 삼키지 않도록,
 *   항목은 반드시 "/lecture/xxx" 처럼 한 단계 더 내려간 경로로 적는다.
 * ★"/about" 은 자식(강사소개·강사 상세·강사 모집)이 전부 공개라 한 줄로 덮는다.
 */
export const PUBLIC_LECTURE_PATHS: ReadonlyArray<string> = [
  "/lecture/home",
  "/lecture/catalog",
  "/lecture/books",
  "/lecture/schedule",
  "/lecture/news",
  "/lecture/exam-info",
  "/lecture/facilities",
  "/about",
  "/location",
];

export function isPublicLecturePath(pathname: string): boolean {
  return PUBLIC_LECTURE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * 강의 플랫폼 진입 허용 판정 — 게이트의 단일 판정부(순수 함수).
 * loader 는 이 결과만 보고 통과·리다이렉트를 정한다.
 */
export function lectureEntryAllowed(input: {
  stage: LectureGateStage;
  isStaff: boolean;
  isPublicPath: boolean;
}): boolean {
  if (input.isStaff) return true; // 강사·원장은 단계와 무관하게 통과
  if (input.stage === "open") return true;
  if (input.stage === "public") return input.isPublicPath;
  return false; // closed
}
// ────────────────────────────────────────────────────────────────────────────

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
  // ★커뮤니티(/community/*)·공지사항·이용가이드는 **학습 플랫폼** 소속이다. 한때
  //   lecture 로 판별했으나(2026-07-27), 그 뒤 강의 플랫폼 비-staff 차단 게이트가 생겨
  //   학생이 게시판에서 튕겨 나갔다 — 되돌림(2026-08-23). 강의 상단바 커뮤니티 드롭다운은
  //   여기로 링크되며, 진입 시 학습 플랫폼으로 컨텍스트가 바뀐다(공유 공간).
  return "study";
}

// 라이트 단일 테마(원장 2026-08-19 최종) — 강의 플랫폼 전체. 커머스 화면의 상품 이미지·
// 가격표가 어두운 배경에서 깨진다. 테마 선택은 학습 플랫폼에서만 한다(강의 상단바에 스위처 없음).
export function isLightOnlySurface(pathname: string): boolean {
  return getActivePlatform(pathname) === "lecture";
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
// 리담안내 하위 7개 — 상단 드롭다운과 /about 섹션 sticky 서브내비가 공유(단일 소스).
export const LECTURE_GUIDE_LINKS: ReadonlyArray<{ label: string; to: string }> =
  [
    { label: "인사말", to: "/about" },
    { label: "강사소개", to: "/about/instructors" },
    { label: "시험정보", to: "/lecture/exam-info" },
    { label: "공지사항", to: "/lecture/announcements" },
    { label: "리담소식", to: "/lecture/news" },
    { label: "학원시설", to: "/lecture/facilities" },
    { label: "찾아오시는 길", to: "/location" },
  ];

// 마이페이지 하위 — 상단 드롭다운과 마이페이지 화면 sticky 서브내비가 공유(단일 소스).
export const LECTURE_MYPAGE_LINKS: ReadonlyArray<{
  label: string;
  to: string;
}> = [
  { label: "수강현황", to: "/lecture" },
  { label: "주문·배송", to: "/lecture/orders" },
  { label: "증명서 발급", to: "/lecture/certificates" },
  { label: "결제내역 조회", to: "/lecture/payments" },
  { label: "쿠폰 관리", to: "/lecture/coupons" },
  { label: "포인트 관리", to: "/lecture/points" },
];

/**
 * 강사·원장에게만 붙는 마이페이지 항목(feat-8-031 정산현황).
 * ★LECTURE_MYPAGE_LINKS 에 그냥 넣으면 수험생에게도 보인다 — 반드시 이 함수로 합친다.
 */
export const LECTURE_MYPAGE_STAFF_LINKS: ReadonlyArray<{
  label: string;
  to: string;
}> = [{ label: "정산현황", to: "/lecture/settlements" }];

export function lectureMypageLinks(
  isStaff: boolean,
): ReadonlyArray<{ label: string; to: string }> {
  return isStaff
    ? [...LECTURE_MYPAGE_LINKS, ...LECTURE_MYPAGE_STAFF_LINKS]
    : LECTURE_MYPAGE_LINKS;
}

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
  // 강사 모집 — 강의 플랫폼 커뮤니티에서만 노출(학습 플랫폼 커뮤니티에는 없음).
  { label: "강사 모집", to: "/about/instructors/recruit" },
];

// ★children 이 있는 항목에도 to 를 둔다 — 폰에서는 자식을 펼치지 않고 **최상위 6개만**
//   칩으로 그리기 때문에(feat-11-012 P2), 부모를 눌렀을 때 갈 곳이 필요하다.
//   데스크톱 LectureNav 는 children 이 있으면 드롭다운으로 분기하므로 이 to 를 무시한다 —
//   PC 동작은 그대로다.
export const LECTURE_NAV_LINKS: ReadonlyArray<LectureNavItem> = [
  {
    label: "리담안내",
    to: "/about",
    children: LECTURE_GUIDE_LINKS,
  },
  { label: "수강신청", to: "/lecture/catalog" },
  { label: "도서구입", to: "/lecture/books" },
  {
    label: "커뮤니티",
    to: "/community/free",
    children: LECTURE_COMMUNITY_LINKS,
  },
  { label: "고객센터", to: "/lecture/support" },
  {
    label: "마이페이지",
    to: "/lecture",
    children: LECTURE_MYPAGE_LINKS,
  },
];

// 드롭다운 활성 판별 — 자식 경로 중 하나와 현재 경로 일치.
// "/lecture" 는 형제(수강신청·도서 등)가 /lecture/* 라 정확일치만.
// "/about"(인사말)도 형제 "/about/instructors"(강사소개)를 삼키지 않도록 정확일치만 —
//   접두 매칭이면 강사소개 페이지에서 인사말이 함께 활성화된다.
export function childMatchesPath(to: string, pathname: string): boolean {
  if (to === "/lecture" || to === "/about") return pathname === to;
  // 강사소개(/about/instructors)는 강사 모집(/about/instructors/recruit)을 삼키지 않는다 —
  //   recruit 은 리담안내가 아니라 커뮤니티 "강사 모집" 항목이라, 여기서 강사소개가
  //   활성화되면 recruit 페이지에 리담안내 서브내비(강사소개 하이라이트)가 떠서
  //   "강사소개로 넘어간 것"처럼 보인다. 강사 상세(:slug)는 강사소개 소속이라 유지.
  if (to === "/about/instructors") {
    return (
      pathname === to ||
      (pathname.startsWith(to + "/") &&
        pathname !== "/about/instructors/recruit")
    );
  }
  return pathname === to || pathname.startsWith(to + "/");
}

// 강의 플랫폼 전용 레이아웃(feat-11) — 학습 플랫폼(navigation.layout)과 별개 화면.
//   자체 상단 바: 브랜드 + 플랫폼 스위처(강의 활성) + 강의 네비 + 계정.
//   학습 nav(사이드바·하단탭·드롭다운)를 재사용하지 않아 서로 간섭 없음.
// ★게이트(2026-08-04 원장 결정 → feat-11-012 P0 에서 단계화): 내부 강의 플랫폼은 개발 중 —
//   비-staff(비로그인 포함)는 어떤 딥링크로 들어와도 운영 사이트(EXTERNAL_LECTURE_URL)로
//   보낸다. 스위처의 "학생 강의 클릭 = lidamedu.com" 정책과 동일 소스.
//   ★★"오픈 = 이 게이트만 제거"가 아니다. /lecture/* 는 private.layout 을 타지 않으므로,
//     게이트를 그냥 지우면 학생 게이트 4종(단일 세션·승인·학습데이터 동의·필수정보)이
//     통째로 비어 버린다. 단계 전환은 platforms.ts 의 LECTURE_GATE_STAGE 한 곳에서 하고,
//     4종은 아래 loader 가 공개 경로 밖에서 직접 건다.
import type { Route } from "./+types/lecture.layout";

import { BellIcon, SearchIcon } from "lucide-react";
import { Link, Outlet, data, redirect, useLocation } from "react-router";

import { BugReportWidget } from "~/features/bug-reports/components/bug-report-widget";
import { getStaffRole } from "~/features/laws/queries.server";
import { CartClearOnPurchase } from "~/features/lms/components/cart-clear-on-purchase";
import { CartLink } from "~/features/lms/components/cart-link";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { useSettlementMenu } from "~/features/subscriptions/components/use-settlement-menu";

import {
  CommandPalette,
  openCommandPalette,
} from "../components/command-palette";
import Footer from "../components/footer";
import { LectureNav, LectureNavMobile } from "../components/lecture-nav";
import { LectureSubNav } from "../components/lecture-sub-nav";
import { UserMenu } from "../components/navigation-bar";
import { PlatformSwitch } from "../components/platform-switch";
import { Button } from "../components/ui/button";
import {
  EXTERNAL_LECTURE_URL,
  LECTURE_COMMUNITY_LINKS,
  LECTURE_GATE_STAGE,
  isPublicLecturePath,
  lectureEntryAllowed,
  lectureGuideLinks,
  lectureMypageLinks,
} from "../lib/platforms";
import { requireAccessApproval } from "../lib/require-approval.server";
import { requireServiceDataConsent } from "../lib/require-consent.server";
import { requireProfileInfo } from "../lib/require-profile.server";
import { enforceSingleSession } from "../lib/single-session.server";
import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const { pathname } = new URL(request.url);
  const publicPath = isPublicLecturePath(pathname);
  const role = user ? await getStaffRole(client, user.id) : null;

  // 진입 판정 — 단계는 platforms.ts 가 소유한다(D3 확정 시 그 상수 하나만 바꾼다).
  if (
    !lectureEntryAllowed({
      stage: LECTURE_GATE_STAGE,
      isStaff: role !== null,
      isPublicPath: publicPath,
    })
  ) {
    throw redirect(EXTERNAL_LECTURE_URL, { headers });
  }

  // ★학생 게이트 4종 — private.layout 이 학습 플랫폼에 걸어 두는 것과 같은 순서·같은 함수.
  //   /lecture/* 는 그 레이아웃을 타지 않으므로 여기서 직접 건다. 공개 화면에는 걸지 않는다
  //   (로그인 없이 보는 화면이므로).
  //   ★네 함수의 면제 방식이 다르다 — 승인·동의·필수정보 셋은 isStaffRole() 로 staff 를
  //     면제하지만, 단일 세션은 role === "student" 인 사람만 검사한다(면제가 아니라 대상 한정).
  //     지금은 staff 만 여기 도달하므로 네 호출 모두 무동작이지만, 역할이 늘면 두 방식이 갈린다.
  if (user && !publicPath) {
    await enforceSingleSession(client, user, request, headers);
    await requireAccessApproval(client, user, request, headers);
    await requireServiceDataConsent(client, user, request, headers);
    await requireProfileInfo(client, user, request, headers);
  }

  const unread = user
    ? await getUnreadCount(client, user.id, role ? "staff" : "student")
    : 0;
  return data(
    {
      user: user
        ? {
            name: (user.user_metadata.name as string) || "학습자",
            email: user.email,
            avatarUrl:
              (user.user_metadata.avatar_url as string | undefined) ?? null,
          }
        : null,
      inboxUnread: unread,
      inboxHref: role ? "/admin/inbox" : "/inbox",
      isStaff: role !== null,
      // 「정산현황」은 강사·원장 본인에게만 보이는 메뉴 — 역할을 화면까지 내려보낸다.
      role,
    },
    { headers },
  );
}

export default function LectureLayout({ loaderData }: Route.ComponentProps) {
  const { user, inboxUnread, inboxHref, isStaff, role } = loaderData;
  // 정산현황 — 항목은 계정 메뉴에, 팝업은 메뉴 바깥에(메뉴와 함께 언마운트되면 안 된다).
  const settlement = useSettlementMenu(!!role);
  // 홈(히어로 캐러셀)에서는 헤더 하단 구분선을 없애 히어로가 상단바에 붙어 보이게.
  //   다른 강의 페이지에선 nav/본문 구분선 유지.
  const pathname = useLocation().pathname;
  const isHome = pathname === "/lecture/home";
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <header
        className={`dark:bg-background/85 dark:border-border sticky top-0 z-50 bg-white/80 backdrop-blur-lg backdrop-saturate-150${
          isHome ? "" : "border-b border-black/[0.06]"
        }`}
      >
        {/* ★폰 헤더 최소폭이 약 480px 이라 400px 화면에서 문서가 가로로 밀렸다(feat-11-012 P2).
            로고 −24px · 스위처 라벨 −약 46px · 검색 아이콘 −44px 로 약 374px 로 내린다. */}
        <div className="mx-auto flex h-12 w-full max-w-[1200px] items-center gap-2 px-4 md:h-16 md:px-6">
          <Link
            to="/lecture/home"
            aria-label="리담변리사학원 — 강의 플랫폼"
            className="flex shrink-0 items-center gap-3"
          >
            <img
              src="/lidam-logo.png"
              alt="리담변리사학원"
              className="h-6 w-auto max-w-none md:h-7 dark:[filter:invert(1)_hue-rotate(180deg)]"
            />
          </Link>
          <PlatformSwitch isStaff={isStaff} />

          {/* 강의 플랫폼 네비 — 데스크톱(마이페이지 드롭다운) */}
          <LectureNav isStaff={isStaff} loggedIn={!!user} />

          <div className="ml-auto flex items-center gap-2">
            <CartLink />
            {user ? (
              <>
                {/* ★폰에서는 내린다 — 장바구니는 구매 동선이라 못 내리고, 검색은 ⌘K 로도
                    열린다(학습 플랫폼도 폰에서 검색을 하단 더보기로 옮긴 선례가 있다). */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-9 md:inline-flex"
                  onClick={() => openCommandPalette()}
                  aria-label="전역 검색 (조문·판례·문제)"
                  title="검색 (⌘K / Ctrl+K)"
                >
                  <SearchIcon className="size-5" />
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="relative size-9"
                >
                  <Link to={inboxHref} aria-label="알림">
                    <BellIcon className="size-5" />
                    {inboxUnread > 0 ? (
                      <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
                        {inboxUnread > 9 ? "9+" : inboxUnread}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <UserMenu
                  name={user.name}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                  extraItems={settlement.item}
                />
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/login">로그인</Link>
              </Button>
            )}
          </div>
        </div>

        {/* 모바일 강의 네비 — 상단 바 아래 가로 스크롤 탭(자식 노드 평탄화) */}
        <LectureNavMobile isStaff={isStaff} loggedIn={!!user} />

        {/* 리담안내/마이페이지 화면에서만 — 하위 sticky 서브내비(헤더에 포함돼 함께 고정) */}
        <LectureSubNav links={lectureGuideLinks(!!user)} />
        {/* ★커뮤니티 자식 중 「강사 모집」(/about/instructors/recruit)만 강의 레이아웃 소속이다.
            폰 탭줄에서 자식을 펼치지 않게 되면서 그 화면의 형제 링크 줄이 사라지므로 여기서 준다.
            나머지 3개(/community/*)는 학습 플랫폼 소속이라 이 레이아웃이 마운트되지 않는다. */}
        <LectureSubNav links={LECTURE_COMMUNITY_LINKS} />
        {user ? <LectureSubNav links={lectureMypageLinks(!!role)} /> : null}
      </header>

      {settlement.dialog}
      <CartClearOnPurchase />
      {user ? <CommandPalette /> : null}
      {/* 오류 신고 — 종전에는 학습 플랫폼(navigation.layout)에만 있어 강의 플랫폼에서
          문제를 발견해도 신고할 방법이 없었다. 같은 위젯·같은 엔드포인트를 쓴다. */}
      {user ? <BugReportWidget /> : null}
      <main className="mx-auto w-full flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

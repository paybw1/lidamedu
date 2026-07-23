import type { Route } from "./+types/navigation.layout";

import { type CSSProperties, Suspense, useEffect, useState } from "react";
import { Await, Link, Outlet, data, useLocation } from "react-router";

import { BugReportWidget } from "~/features/bug-reports/components/bug-report-widget";
import { listActivePopupNotices } from "~/features/admin/queries/popup-notices.server";
import { getInstructorSubjects } from "~/core/lib/staff-subject-guard.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";

import { CommandPalette } from "../components/command-palette";
import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import { PlatformSwitch } from "../components/platform-switch";
import { PopupNoticeModal } from "../components/popup-notice-modal";
import { StudentBottomBar } from "../components/student-bottombar";
import { StudentSidebar } from "../components/student-sidebar";
import makeServerClient from "../lib/supa-client.server";
import { cn } from "../lib/utils";

/**
 * cookie 에서 studentNavMode 읽기. "sidebar" | "topbar" | null.
 * UserMenu 의 토글이 reload 전에 document.cookie 도 set 함 → SSR loader 에 반영.
 */
function readNavModeCookie(request: Request): "topbar" | "sidebar" {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)studentNavMode=(topbar|sidebar)/);
  return m?.[1] === "sidebar" ? "sidebar" : "topbar";
}

export async function loader({ request }: Route.LoaderArgs) {
  // headers 전달 — supabase 갱신 cookie 누수 방지 (private.layout 와 동일 이유).
  // 비동기 promise streaming 도 같은 client 인스턴스 사용 — getUser 가 토큰 갱신
  // 하면 setAll 콜백이 이 headers 에 누적된다.
  const [client, headers] = makeServerClient(request);
  // cookie 기반 사용자 nav 선호. 기본 = topbar.
  const navMode: "topbar" | "sidebar" = readNavModeCookie(request);
  const userPromise = client.auth.getUser();
  const inboxPromise = (async () => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return {
        isStaff: false,
        gradeStaff: false,
        unread: 0,
        features: [] as string[],
        subjects: [] as "all" | string[],
        staffPreparing: "all" as "all" | string[],
      };
    const role = await getStaffRole(client, user.id);
    const audience: "staff" | "student" = role ? "staff" : "student";
    const [unread, access, staffPreparing] = await Promise.all([
      getUnreadCount(client, user.id, audience),
      getMembershipAccess(client, user.id),
      // feat-7-041 — 준비 중 과목의 staff 접근: admin/manager=전체, instructor=담당 과목만.
      role === "instructor"
        ? getInstructorSubjects(user.id)
        : Promise.resolve<"all" | string[]>("all"),
    ]);
    return {
      isStaff: role !== null,
      // 잠금(dim) 판정용 — 등급 리졸버 기준. 원장 등급 체험(membership_test_grade)
      // 중에는 false 가 되어 학생과 동일한 비활성 표시를 재현한다.
      gradeStaff: access.grade === "staff",
      unread,
      features: access.features,
      subjects: access.subjects,
      staffPreparing,
    };
  })();
  // 팝업 공지 — 활성+기간내 공지(RLS 필터). 부가 기능이라 스트리밍(promise)으로 비차단.
  const popupNoticesPromise = listActivePopupNotices(client);
  return data(
    { userPromise, inboxPromise, navMode, popupNoticesPromise },
    { headers },
  );
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise, inboxPromise, navMode, popupNoticesPromise } =
    loaderData;
  // 운영관리(/admin)는 두 플랫폼 공용 영역 — 학습 플랫폼 메뉴를 숨긴 중립 상단 바로
  // 렌더(로고·플랫폼 스위처·인박스·계정만). 강의 플랫폼에서 진입해도 학습 플랫폼으로
  // 바뀐 것처럼 보이지 않도록. 콘솔 UI 는 AdminShell 사이드바가 담당.
  const { pathname } = useLocation();
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSidebar = navMode === "sidebar";
  // 하단 탭바 접기 상태 — 공부 화면 확대용. localStorage 로 유지.
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem("bottomNavCollapsed") === "1") {
      setNavCollapsed(true);
    }
  }, []);
  const toggleNav = () =>
    setNavCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("bottomNavCollapsed", next ? "1" : "0");
      return next;
    });
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col justify-between md:pb-0",
        // 모바일 하단 탭바에 콘텐츠·푸터가 가리지 않도록 회피 패딩. 접힘 상태면
        // 핸들 높이만큼만 비운다. md+ 는 하단바 없음 → 패딩 제거.
        navCollapsed
          ? "pb-[calc(1.75rem+env(safe-area-inset-bottom))]"
          : "pb-[calc(5rem+env(safe-area-inset-bottom))]",
      )}
      // 영역 토글(AreaTabs/SectionTabs) sticky 오프셋 — md+ 기준. topbar 모드는 상단
      //   navbar(h-16=4rem) 아래에 붙도록, sidebar 모드는 navbar 가 없어 0. 모바일은
      //   SectionTabs 가 항상 top-0(navbar 가 모바일에서 hidden).
      style={
        {
          "--area-sticky-top": isSidebar ? "0px" : "4rem",
        } as CSSProperties
      }
    >
      {/* 상단 NavigationBar — sidebar 모드에선 hideAll=true → null. 그 외는 정상 노출. */}
      <Suspense
        fallback={
          <NavigationBar loading={true} hideAll={isSidebar} hideMenus={isAdminArea} />
        }
      >
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user === null ? (
              // 비로그인 — 사이드바 모드 쿠키가 있어도 상단 바를 유지한다.
              // (사이드바는 인증 사용자 전용이라 hideAll 로 숨기면 내비가 통째로 사라짐)
              <NavigationBar loading={false} hideAll={false} hideMenus={isAdminArea} />
            ) : (
              <Suspense
                fallback={
                  <NavigationBar
                    name={user.user_metadata.name || "학습자"}
                    email={user.email}
                    avatarUrl={user.user_metadata.avatar_url}
                    loading={false}
                    hideAll={isSidebar}
                    hideMenus={isAdminArea}
                  />
                }
              >
                <Await resolve={inboxPromise}>
                  {(inbox) => (
                    <NavigationBar
                      name={user.user_metadata.name || "학습자"}
                      email={user.email}
                      avatarUrl={user.user_metadata.avatar_url}
                      loading={false}
                      inboxUnread={inbox.unread}
                      inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                      isStaff={inbox.isStaff}
                      gradeStaff={inbox.gradeStaff}
                      features={inbox.features}
                      subjects={inbox.subjects}
                      staffPreparing={inbox.staffPreparing}
                      hideAll={isSidebar}
                      hideMenus={isAdminArea}
                    />
                  )}
                </Await>
              </Suspense>
            )
          }
        </Await>
      </Suspense>
      {/* 모바일 전용 얇은 브랜드 스트립 — 인증 사용자는 상단 바(및 모바일에서
          숨는 사이드바)가 없으므로 로고/홈 바로가기를 보완. sticky 아님(스크롤하면
          사라져 콘텐츠 영역 확보). md↑ 는 상단 바/사이드바가 로고 제공하므로 숨김. */}
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user ? (
              <div className="border-border bg-background flex h-11 items-center gap-3 border-b px-4 md:hidden">
                <Link
                  to="/"
                  aria-label="리담변리사학원 홈 — 학습 플랫폼"
                  className="flex shrink-0 items-center"
                >
                  <img
                    src="/lidam-logo.png"
                    alt="리담변리사학원"
                    className="h-6 w-auto max-w-none dark:[filter:invert(1)_hue-rotate(180deg)]"
                  />
                </Link>
                {/* 강의 플랫폼 오픈 전까지 staff 에게만 노출(IA 검증). */}
                <Suspense fallback={null}>
                  <Await resolve={inboxPromise}>
                    {(inbox) => (inbox.isStaff ? <PlatformSwitch /> : null)}
                  </Await>
                </Suspense>
              </div>
            ) : null
          }
        </Await>
      </Suspense>
      <div className={cn("flex w-full flex-1", isSidebar && "md:flex-row")}>
        {isSidebar ? (
          <Suspense fallback={null}>
            <Await resolve={inboxPromise}>
              {(inbox) => (
                <Await resolve={userPromise}>
                  {({ data: { user } }) =>
                    user ? (
                      <StudentSidebar
                        isStaff={inbox.isStaff}
                        gradeStaff={inbox.gradeStaff}
                        user={{
                          name: user.user_metadata.name || "학습자",
                          email: user.email,
                          avatarUrl: user.user_metadata.avatar_url,
                        }}
                        inboxUnread={inbox.unread}
                        inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                        features={inbox.features}
                        subjects={inbox.subjects}
                        staffPreparing={inbox.staffPreparing}
                      />
                    ) : null
                  }
                </Await>
              )}
            </Await>
          </Suspense>
        ) : null}
        {isSidebar ? (
          // sidebar 모드: Footer 를 콘텐츠 컬럼 안에 둔다. 사이드바가 h-screen 이라
          // Footer 가 행 바깥 형제이면 콘텐츠가 짧아도 100vh+푸터 만큼 불필요 스크롤이
          // 생긴다 → 컬럼을 flex-col 로 만들고 Outlet 을 flex-1 로 채워 Footer 를 하단 고정.
          <div className="flex w-full min-w-0 flex-col">
            <div className="flex-1">
              <Outlet />
            </div>
            <Footer />
          </div>
        ) : (
          <div className="mx-auto w-full">
            <Outlet />
          </div>
        )}
      </div>
      {/* 모바일 하단탭 — md 미만에서만. 모든 인증 사용자에게 노출. */}
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user ? (
              <Suspense fallback={null}>
                <Await resolve={inboxPromise}>
                  {(inbox) => (
                    <StudentBottomBar
                      isStaff={inbox.isStaff}
                      gradeStaff={inbox.gradeStaff}
                      inboxUnread={inbox.unread}
                      inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                      user={{
                        name: user.user_metadata.name || "학습자",
                        email: user.email,
                        avatarUrl: user.user_metadata.avatar_url,
                      }}
                      collapsed={navCollapsed}
                      onToggleCollapse={toggleNav}
                      features={inbox.features}
                      subjects={inbox.subjects}
                      staffPreparing={inbox.staffPreparing}
                    />
                  )}
                </Await>
              </Suspense>
            ) : null
          }
        </Await>
      </Suspense>
      {/* topbar 모드는 표준 하단 Footer. sidebar 모드는 위 콘텐츠 컬럼 안에서 렌더. */}
      {!isSidebar ? <Footer /> : null}
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) => (user ? <BugReportWidget /> : null)}
        </Await>
      </Suspense>
      {/* 전역 검색(⌘K) 팔레트 — 상단바 검색 아이콘(로그인 시 노출)의 대상. navigation.layout
          전역에 마운트해 랜딩 등 private.layout 밖 페이지에서도 작동(예전엔 private.layout 에만
          있어 랜딩에서 아이콘이 먹통). private.layout 은 이 아래 nest 라 거기선 제거(중복 방지). */}
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) => (user ? <CommandPalette /> : null)}
        </Await>
      </Suspense>
      {/* 팝업 공지 — 활성 공지가 있으면 모달. 닫기 상태는 localStorage(컴포넌트 소유). */}
      <Suspense fallback={null}>
        <Await resolve={popupNoticesPromise}>
          {(notices) =>
            notices.length > 0 ? <PopupNoticeModal notices={notices} /> : null
          }
        </Await>
      </Suspense>
    </div>
  );
}

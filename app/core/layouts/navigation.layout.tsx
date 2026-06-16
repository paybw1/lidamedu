import type { Route } from "./+types/navigation.layout";

import { Suspense, useEffect, useState } from "react";
import { Await, Link, Outlet, data } from "react-router";

import { BugReportWidget } from "~/features/bug-reports/components/bug-report-widget";
import { getStaffRole } from "~/features/laws/queries.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
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
    if (!user) return { isStaff: false, unread: 0, features: [] as string[] };
    const role = await getStaffRole(client, user.id);
    const audience: "staff" | "student" = role ? "staff" : "student";
    const [unread, sub] = await Promise.all([
      getUnreadCount(client, user.id, audience),
      getActiveSubscription(client, user.id),
    ]);
    return { isStaff: role !== null, unread, features: sub.features };
  })();
  return data({ userPromise, inboxPromise, navMode }, { headers });
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise, inboxPromise, navMode } = loaderData;
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
    >
      {/* 상단 NavigationBar — sidebar 모드에선 hideAll=true → null. 그 외는 정상 노출. */}
      <Suspense fallback={<NavigationBar loading={true} hideAll={isSidebar} />}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user === null ? (
              <NavigationBar loading={false} hideAll={isSidebar} />
            ) : (
              <Suspense
                fallback={
                  <NavigationBar
                    name={user.user_metadata.name || "Anonymous"}
                    email={user.email}
                    avatarUrl={user.user_metadata.avatar_url}
                    loading={false}
                    hideAll={isSidebar}
                  />
                }
              >
                <Await resolve={inboxPromise}>
                  {(inbox) => (
                    <NavigationBar
                      name={user.user_metadata.name || "Anonymous"}
                      email={user.email}
                      avatarUrl={user.user_metadata.avatar_url}
                      loading={false}
                      inboxUnread={inbox.unread}
                      inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                      isStaff={inbox.isStaff}
                      features={inbox.features}
                      hideAll={isSidebar}
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
              <div className="border-border bg-background flex h-11 items-center border-b px-4 md:hidden">
                <Link to="/" aria-label="리담변리사학원 홈" className="shrink-0">
                  <img
                    src="/lidam-logo.png"
                    alt="리담변리사학원"
                    className="h-6 w-auto max-w-none dark:[filter:invert(1)_hue-rotate(180deg)]"
                  />
                </Link>
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
                        user={{
                          name: user.user_metadata.name || "Anonymous",
                          email: user.email,
                          avatarUrl: user.user_metadata.avatar_url,
                        }}
                        inboxUnread={inbox.unread}
                        inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                        features={inbox.features}
                      />
                    ) : null
                  }
                </Await>
              )}
            </Await>
          </Suspense>
        ) : null}
        <div className={cn("w-full", !isSidebar && "mx-auto")}>
          <Outlet />
        </div>
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
                      inboxUnread={inbox.unread}
                      inboxHref={inbox.isStaff ? "/admin/inbox" : "/inbox"}
                      user={{
                        name: user.user_metadata.name || "Anonymous",
                        email: user.email,
                        avatarUrl: user.user_metadata.avatar_url,
                      }}
                      collapsed={navCollapsed}
                      onToggleCollapse={toggleNav}
                      features={inbox.features}
                    />
                  )}
                </Await>
              </Suspense>
            ) : null
          }
        </Await>
      </Suspense>
      <Footer />
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) => (user ? <BugReportWidget /> : null)}
        </Await>
      </Suspense>
    </div>
  );
}

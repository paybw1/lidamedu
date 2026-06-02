import type { Route } from "./+types/navigation.layout";

import { Suspense } from "react";
import { Await, Outlet } from "react-router";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import { StudentSidebar } from "../components/student-sidebar";
import { StudentBottomBar } from "../components/student-bottombar";
import { BugReportWidget } from "~/features/bug-reports/components/bug-report-widget";
import { cn } from "../lib/utils";
import makeServerClient from "../lib/supa-client.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";

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
  const [client] = makeServerClient(request);
  // cookie 기반 사용자 nav 선호. 기본 = topbar.
  const navMode: "topbar" | "sidebar" = readNavModeCookie(request);
  const userPromise = client.auth.getUser();
  const inboxPromise = (async () => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return { isStaff: false, unread: 0, features: [] as string[] };
    const role = await getStaffRole(client, user.id);
    const audience: "staff" | "student" = role ? "staff" : "student";
    const [unread, sub] = await Promise.all([
      getUnreadCount(client, user.id, audience),
      getActiveSubscription(client, user.id),
    ]);
    return { isStaff: role !== null, unread, features: sub.features };
  })();
  return { userPromise, inboxPromise, navMode };
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise, inboxPromise, navMode } = loaderData;
  const isSidebar = navMode === "sidebar";
  return (
    <div className="flex min-h-screen flex-col justify-between">
      {/* 상단 NavigationBar — sidebar 모드에선 hideAll=true → null. 그 외는 정상 노출. */}
      <Suspense
        fallback={<NavigationBar loading={true} hideAll={isSidebar} />}
      >
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
                  {(inbox) => <StudentBottomBar isStaff={inbox.isStaff} />}
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

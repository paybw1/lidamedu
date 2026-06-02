import type { Route } from "./+types/navigation.layout";

import { Suspense } from "react";
import { Await, Outlet } from "react-router";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import { StudentSidebar } from "../components/student-sidebar";
import { BugReportWidget } from "~/features/bug-reports/components/bug-report-widget";
import { cn } from "../lib/utils";
import makeServerClient from "../lib/supa-client.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  // 새 nav (사이드바) 검증용 토글 — ?newnav=1 로 진입 시 활성. 기본은 기존 상단 메뉴.
  const newNav = new URL(request.url).searchParams.get("newnav") === "1";
  // 사용자 + (역할에 맞는) 미읽음 알림 카운트 비동기 surface.
  const userPromise = client.auth.getUser();
  const inboxPromise = (async () => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return { isStaff: false, unread: 0, features: [] as string[] };
    const role = await getStaffRole(client, user.id);
    const audience: "staff" | "student" = role ? "staff" : "student";
    // feat-8-008 — 영역 플래그를 함께 surface (네비 잠금 표시용).
    const [unread, sub] = await Promise.all([
      getUnreadCount(client, user.id, audience),
      getActiveSubscription(client, user.id),
    ]);
    return { isStaff: role !== null, unread, features: sub.features };
  })();
  return { userPromise, inboxPromise, newNav };
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise, inboxPromise, newNav } = loaderData;
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <Suspense fallback={<NavigationBar loading={true} hideMenus={newNav} />}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user === null ? (
              <NavigationBar loading={false} hideMenus={newNav} />
            ) : (
              <Suspense
                fallback={
                  <NavigationBar
                    name={user.user_metadata.name || "Anonymous"}
                    email={user.email}
                    avatarUrl={user.user_metadata.avatar_url}
                    loading={false}
                    hideMenus={newNav}
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
                      hideMenus={newNav}
                    />
                  )}
                </Await>
              </Suspense>
            )
          }
        </Await>
      </Suspense>
      <div className={cn("mx-auto flex w-full flex-1", newNav && "md:flex-row")}>
        {newNav ? (
          <Suspense fallback={null}>
            <Await resolve={inboxPromise}>
              {(inbox) => <StudentSidebar isStaff={inbox.isStaff} />}
            </Await>
          </Suspense>
        ) : null}
        <div className="mx-auto w-full">
          <Outlet />
        </div>
      </div>
      <Footer />
      <Suspense fallback={null}>
        <Await resolve={userPromise}>
          {({ data: { user } }) => (user ? <BugReportWidget /> : null)}
        </Await>
      </Suspense>
    </div>
  );
}

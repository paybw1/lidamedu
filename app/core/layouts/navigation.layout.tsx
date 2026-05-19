import type { Route } from "./+types/navigation.layout";

import { Suspense } from "react";
import { Await, Outlet } from "react-router";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import makeServerClient from "../lib/supa-client.server";
import { getUnreadCount } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
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
  return { userPromise, inboxPromise };
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise, inboxPromise } = loaderData;
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <Suspense fallback={<NavigationBar loading={true} />}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user === null ? (
              <NavigationBar loading={false} />
            ) : (
              <Suspense
                fallback={
                  <NavigationBar
                    name={user.user_metadata.name || "Anonymous"}
                    email={user.email}
                    avatarUrl={user.user_metadata.avatar_url}
                    loading={false}
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
                    />
                  )}
                </Await>
              </Suspense>
            )
          }
        </Await>
      </Suspense>
      <div className="mx-auto w-full">
        <div className="mx-auto w-full">
          <Outlet />
        </div>
      </div>
      <Footer />
    </div>
  );
}

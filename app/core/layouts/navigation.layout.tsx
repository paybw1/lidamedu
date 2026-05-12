import type { Route } from "./+types/navigation.layout";

import { Suspense } from "react";
import { Await, Outlet } from "react-router";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import makeServerClient from "../lib/supa-client.server";
import { getStaffUnreadCount } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  // 사용자는 비동기로 surface, staff 알림 카운트는 별도 Promise.
  const userPromise = client.auth.getUser();
  const inboxPromise = (async () => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { isStaff: false, unread: 0 };
    const role = await getStaffRole(client, user.id);
    if (!role) return { isStaff: false, unread: 0 };
    const unread = await getStaffUnreadCount(client, user.id);
    return { isStaff: true, unread };
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
                      staffInbox={inbox.isStaff ? inbox.unread : null}
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

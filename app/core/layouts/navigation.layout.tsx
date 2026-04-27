import type { Route } from "./+types/navigation.layout";

import { Suspense } from "react";
import { Await, Outlet } from "react-router";

import Footer from "../components/footer";
import { NavigationBar } from "../components/navigation-bar";
import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const userPromise = client.auth.getUser();
  return { userPromise };
}

export default function NavigationLayout({ loaderData }: Route.ComponentProps) {
  const { userPromise } = loaderData;
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <Suspense fallback={<NavigationBar loading={true} />}>
        <Await resolve={userPromise}>
          {({ data: { user } }) =>
            user === null ? (
              <NavigationBar loading={false} />
            ) : (
              <NavigationBar
                name={user.user_metadata.name || "Anonymous"}
                email={user.email}
                avatarUrl={user.user_metadata.avatar_url}
                loading={false}
              />
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

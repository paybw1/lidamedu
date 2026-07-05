import type { Route } from "./+types/biology";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { loadScienceHubData } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "생물 | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  return loadScienceHubData(client, user?.id ?? null, "biology");
}

export default function SubjectBiology({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="biology"
      sections={loaderData.sections}
      years={loaderData.years}
      progress={loaderData.progress}
      bookmarks={loaderData.bookmarks}
      resume={loaderData.resume}
      wrongCount={loaderData.wrongCount}
    />
  );
}

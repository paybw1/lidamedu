import type { Route } from "./+types/chemistry";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { loadScienceHubData } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "화학 | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  return loadScienceHubData(client, user?.id ?? null, "chemistry");
}

export default function SubjectChemistry({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="chemistry"
      sections={loaderData.sections}
      years={loaderData.years}
      progress={loaderData.progress}
      bookmarks={loaderData.bookmarks}
      resume={loaderData.resume}
      wrongCount={loaderData.wrongCount}
    />
  );
}

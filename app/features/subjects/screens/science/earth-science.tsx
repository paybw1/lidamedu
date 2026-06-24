import type { Route } from "./+types/earth-science";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import {
  getScienceProgress,
  listScienceYears,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [
  { title: "지구과학 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, years, progress] = await Promise.all([
    listSectionsWithStats(client, "earth_science", user?.id ?? null),
    listScienceYears(client, "earth_science"),
    user
      ? getScienceProgress(client, user.id, "earth_science")
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { sections, years, progress };
}

export default function SubjectEarthScience({
  loaderData,
}: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="earth_science"
      sections={loaderData.sections}
      years={loaderData.years}
      progress={loaderData.progress}
    />
  );
}

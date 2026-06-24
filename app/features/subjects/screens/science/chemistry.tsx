import type { Route } from "./+types/chemistry";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import {
  getScienceProgress,
  listScienceYears,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "화학 | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, years, progress] = await Promise.all([
    listSectionsWithStats(client, "chemistry", user?.id ?? null),
    listScienceYears(client, "chemistry"),
    user
      ? getScienceProgress(client, user.id, "chemistry")
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { sections, years, progress };
}

export default function SubjectChemistry({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="chemistry"
      sections={loaderData.sections}
      years={loaderData.years}
      progress={loaderData.progress}
    />
  );
}

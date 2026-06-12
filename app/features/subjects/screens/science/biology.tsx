import type { Route } from "./+types/biology";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import {
  getScienceProgress,
  listScienceYears,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "생물 | Lidam Patent Attorney Academy" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, years, progress] = await Promise.all([
    listSectionsWithStats(client, "biology", user?.id ?? null),
    listScienceYears(client, "biology"),
    user
      ? getScienceProgress(client, user.id, "biology")
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { sections, years, progress };
}

export default function SubjectBiology({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="biology"
      sections={loaderData.sections}
      years={loaderData.years}
      progress={loaderData.progress}
    />
  );
}

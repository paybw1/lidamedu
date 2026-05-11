import type { Route } from "./+types/physics";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import {
  getScienceProgress,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "물리 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, progress] = await Promise.all([
    listSectionsWithStats(client, "physics", user?.id ?? null),
    user
      ? getScienceProgress(client, user.id, "physics")
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { sections, progress };
}

export default function SubjectPhysics({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="physics"
      sections={loaderData.sections}
      progress={loaderData.progress}
    />
  );
}

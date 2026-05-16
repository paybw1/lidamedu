import type { Route } from "./+types/chemistry";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import {
  getScienceProgress,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "화학 | Lidam Patent Attorney Academy" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, progress] = await Promise.all([
    listSectionsWithStats(client, "chemistry", user?.id ?? null),
    user
      ? getScienceProgress(client, user.id, "chemistry")
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { sections, progress };
}

export default function SubjectChemistry({ loaderData }: Route.ComponentProps) {
  return (
    <ScienceHub
      subject="chemistry"
      sections={loaderData.sections}
      progress={loaderData.progress}
    />
  );
}

import type { Route } from "./+types/physics";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { listSectionsWithCounts } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "물리 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const sections = await listSectionsWithCounts(client, "physics");
  return { sections };
}

export default function SubjectPhysics({ loaderData }: Route.ComponentProps) {
  return <ScienceHub subject="physics" sections={loaderData.sections} />;
}

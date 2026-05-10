import type { Route } from "./+types/chemistry";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { listSectionsWithCounts } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "화학 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const sections = await listSectionsWithCounts(client, "chemistry");
  return { sections };
}

export default function SubjectChemistry({ loaderData }: Route.ComponentProps) {
  return <ScienceHub subject="chemistry" sections={loaderData.sections} />;
}

import type { Route } from "./+types/earth-science";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { listSectionsWithCounts } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [
  { title: "지구과학 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const sections = await listSectionsWithCounts(client, "earth_science");
  return { sections };
}

export default function SubjectEarthScience({
  loaderData,
}: Route.ComponentProps) {
  return <ScienceHub subject="earth_science" sections={loaderData.sections} />;
}

import type { Route } from "./+types/biology";

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHub from "~/features/subjects/components/science-hub";
import { listSectionsWithCounts } from "~/features/subjects/lib/science.server";

export const meta: Route.MetaFunction = () => [{ title: "생물 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const sections = await listSectionsWithCounts(client, "biology");
  return { sections };
}

export default function SubjectBiology({ loaderData }: Route.ComponentProps) {
  return <ScienceHub subject="biology" sections={loaderData.sections} />;
}

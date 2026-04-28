import type { Route } from "./+types/civil-procedure";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "민사소송법 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return loadSubjectHub(request, "civil-procedure");
}

export default function SubjectCivilProcedure({
  loaderData,
}: Route.ComponentProps) {
  return (
    <SubjectHub
      subject={LAW_SUBJECTS["civil-procedure"]}
      articles={loaderData.articles}
      cases={loaderData.cases}
      problems={loaderData.problems}
      caseQuery={loaderData.caseQuery}
      progress={loaderData.progress}
      recentRevisionDate={loaderData.recentRevisionDate}
    />
  );
}

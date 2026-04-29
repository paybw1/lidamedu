import type { Route } from "./+types/civil";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [{ title: "민법 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  return loadSubjectHub(request, "civil");
}

export default function SubjectCivil({ loaderData }: Route.ComponentProps) {
  return (
    <SubjectHub
      subject={LAW_SUBJECTS.civil}
      articles={loaderData.articles}
      systematicNodes={loaderData.systematicNodes}
      cases={loaderData.cases}
      problems={loaderData.problems}
      caseQuery={loaderData.caseQuery}
      progress={loaderData.progress}
      recentRevisionDate={loaderData.recentRevisionDate}
      bookmarkLevels={loaderData.bookmarkLevels}
      annotationCounts={loaderData.annotationCounts}
    />
  );
}

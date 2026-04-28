import type { Route } from "./+types/trademark";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [{ title: "상표법 | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  return loadSubjectHub(request, "trademark");
}

export default function SubjectTrademark({ loaderData }: Route.ComponentProps) {
  return (
    <SubjectHub
      subject={LAW_SUBJECTS.trademark}
      articles={loaderData.articles}
      cases={loaderData.cases}
      problems={loaderData.problems}
      caseQuery={loaderData.caseQuery}
      progress={loaderData.progress}
      recentRevisionDate={loaderData.recentRevisionDate}
    />
  );
}

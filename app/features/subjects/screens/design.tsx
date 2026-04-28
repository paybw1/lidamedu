import type { Route } from "./+types/design";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "디자인보호법 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return loadSubjectHub(request, "design");
}

export default function SubjectDesign({ loaderData }: Route.ComponentProps) {
  return (
    <SubjectHub
      subject={LAW_SUBJECTS.design}
      articles={loaderData.articles}
      cases={loaderData.cases}
      problems={loaderData.problems}
      caseQuery={loaderData.caseQuery}
      progress={loaderData.progress}
      recentRevisionDate={loaderData.recentRevisionDate}
    />
  );
}

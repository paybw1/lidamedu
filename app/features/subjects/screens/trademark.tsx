import type { Route } from "./+types/trademark";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [{ title: "상표법 | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  return loadSubjectHub(request, "trademark");
}

export default function SubjectTrademark({ loaderData }: Route.ComponentProps) {
  return (
    <SubjectHub
      subject={LAW_SUBJECTS.trademark}
      lawId={loaderData.law?.lawId}
      articles={loaderData.articles}
      systematicNodes={loaderData.systematicNodes}
      cases={loaderData.cases}
      casesTotal={loaderData.casesTotal}
      caseFilters={loaderData.caseFilters}
      caseTreeCounts={loaderData.caseTreeCounts}
      problems={loaderData.problems}
      caseQuery={loaderData.caseQuery}
      progress={loaderData.progress}
      recentRevisionDate={loaderData.recentRevisionDate}
      bookmarkLevels={loaderData.bookmarkLevels}
      annotationCounts={loaderData.annotationCounts}
      problemYears={loaderData.problemYears}
      problemFilters={loaderData.problemFilters}
      problemStats={loaderData.problemStats}
      problemAggStats={loaderData.problemAggStats}
      recommendedArticles={loaderData.recommendedArticles}
      progressByArticle={loaderData.progressByArticle}
      systematicNodeProblemStats={loaderData.systematicNodeProblemStats}
      problemNodeFilter={loaderData.problemNodeFilter}
      axisCounts={loaderData.axisCounts}
    />
  );
}

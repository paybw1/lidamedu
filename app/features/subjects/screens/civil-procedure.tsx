import type { Route } from "./+types/civil-procedure";

import { SubjectHub } from "../components/subject-hub";
import { loadSubjectHub } from "../lib/loader.server";
import { LAW_SUBJECTS } from "../lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "민사소송법 | 리담변리사학원" },
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
      lawId={loaderData.law?.lawId}
      articles={loaderData.articles}
      systematicNodes={loaderData.systematicNodes}
      cases={loaderData.cases}
      casesTotal={loaderData.casesTotal}
      diagramCaseIds={loaderData.diagramCaseIds}
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
      isStaff={loaderData.isStaff}
      subjectiveAttemptStatus={loaderData.subjectiveAttemptStatus}
      subjectiveNodeStats={loaderData.subjectiveNodeStats}
      subjectiveNodeLeaves={loaderData.subjectiveNodeLeaves}
      subjectiveNodeFilter={loaderData.subjectiveNodeFilter}
      subjectivePlacements={loaderData.subjectivePlacements}
    />
  );
}

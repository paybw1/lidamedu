import {
  getArticleSkeleton,
  getLatestPublishedRevisionDate,
  getLawByCode,
  getSystematicSkeleton,
  type ArticleNode,
  type LawHeader,
  type SystematicNode,
} from "~/features/laws/queries.server";
import {
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  type ArticleAnnotationCounts,
} from "~/features/annotations/queries.server";
import {
  listCasesBySubject,
  type CaseListItem,
} from "~/features/cases/queries.server";
import {
  listProblemsBySubject,
  type ProblemListItem,
} from "~/features/problems/queries.server";
import {
  getSubjectProgress,
  type SubjectProgress,
} from "~/features/study/queries.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { LawSubjectSlug } from "./subjects";

export interface SubjectHubData {
  law: LawHeader | null;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  cases: CaseListItem[];
  problems: ProblemListItem[];
  recentRevisionDate: string | null;
  progress: SubjectProgress | null;
  bookmarkLevels: Record<string, number>;
  annotationCounts: Record<string, ArticleAnnotationCounts>;
}

export async function loadSubjectHub(
  request: Request,
  lawCode: LawSubjectSlug,
): Promise<SubjectHubData & { caseQuery: string }> {
  const url = new URL(request.url);
  const caseQuery = url.searchParams.get("q") ?? "";

  const [client] = makeServerClient(request);
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    return {
      law: null,
      articles: [],
      systematicNodes: [],
      cases: [],
      problems: [],
      recentRevisionDate: null,
      progress: null,
      bookmarkLevels: {},
      annotationCounts: {},
      caseQuery,
    };
  }
  const [articles, systematicNodes, cases, problems, recentRevisionDate] =
    await Promise.all([
      getArticleSkeleton(client, law.lawId),
      getSystematicSkeleton(client, lawCode),
      listCasesBySubject(client, lawCode, caseQuery || undefined),
      listProblemsBySubject(client, lawCode),
      getLatestPublishedRevisionDate(client, law.lawId),
    ]);

  const totalArticleCount = articles.filter((a) => a.level === "article").length;

  const {
    data: { user },
  } = await client.auth.getUser();
  const [progress, bookmarkLevels, annotationCounts] = user
    ? await Promise.all([
        getSubjectProgress(client, user.id, lawCode, totalArticleCount),
        getUserArticleBookmarkLevels(client, user.id),
        getUserArticleAnnotationCounts(client, user.id),
      ])
    : [null, {}, {}];

  return {
    law,
    articles,
    systematicNodes,
    cases,
    problems,
    recentRevisionDate,
    progress,
    bookmarkLevels,
    annotationCounts,
    caseQuery,
  };
}

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
  type CaseCourtFilter,
  type CaseExamFilter,
  type CaseListItem,
  type CaseSubjectSort,
} from "~/features/cases/queries.server";
import {
  listProblemsBySubject,
  listProblemYears,
  type ProblemListItem,
} from "~/features/problems/queries.server";
import type {
  ProblemExamRound,
  ProblemFormat,
  ProblemOrigin,
  ProblemPolarity,
  ProblemScope,
} from "~/features/problems/labels";
import {
  getProblemStatsBulk,
  getRecommendedArticles,
  getSubjectProgress,
  getUserProblemStats,
  type RecommendedArticleItem,
  type SubjectProgress,
  type UserProblemStats,
} from "~/features/study/queries.server";
import type {
  DifficultyBucket,
  ProblemAggregateStats,
} from "~/features/study/lib/difficulty";
import makeServerClient from "~/core/lib/supa-client.server";

import type { LawSubjectSlug } from "./subjects";

export type ProblemSort = "number" | "hardest" | "easiest" | "newest";

export interface ProblemFiltersApplied {
  origin?: ProblemOrigin;
  year?: number;
  examRound?: ProblemExamRound;
  format?: ProblemFormat;
  polarity?: ProblemPolarity;
  scope?: ProblemScope;
  difficulty?: DifficultyBucket | "no_data";
  sort?: ProblemSort;
  search?: string;
}

export interface CaseFiltersApplied {
  q: string;
  court: CaseCourtFilter;
  exam: CaseExamFilter;
  sort: CaseSubjectSort;
  page: number;
  pageSize: number;
}

export interface SubjectHubData {
  law: LawHeader | null;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  cases: CaseListItem[];
  casesTotal: number;
  caseFilters: CaseFiltersApplied;
  problems: ProblemListItem[];
  recentRevisionDate: string | null;
  progress: SubjectProgress | null;
  bookmarkLevels: Record<string, number>;
  annotationCounts: Record<string, ArticleAnnotationCounts>;
  problemYears: number[];
  problemFilters: ProblemFiltersApplied;
  problemStats: UserProblemStats | null;
  problemAggStats: Record<string, ProblemAggregateStats>;
  recommendedArticles: RecommendedArticleItem[];
}

const CASE_SORTS: readonly CaseSubjectSort[] = [
  "decided_desc",
  "decided_asc",
  "case_no",
];
const CASE_COURT_FILTERS: readonly CaseCourtFilter[] = [
  "all",
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
];
const CASE_EXAM_FILTERS: readonly CaseExamFilter[] = [
  "any",
  "exam_1st",
  "exam_2nd",
  "exam_both",
];

function parseCaseFilters(url: URL): CaseFiltersApplied {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const sortRaw = url.searchParams.get("case_sort") ?? "decided_desc";
  const sort = (CASE_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as CaseSubjectSort)
    : "decided_desc";
  const courtRaw = url.searchParams.get("case_court") ?? "all";
  const court = (CASE_COURT_FILTERS as readonly string[]).includes(courtRaw)
    ? (courtRaw as CaseCourtFilter)
    : "all";
  const examRaw = url.searchParams.get("case_exam") ?? "any";
  const exam = (CASE_EXAM_FILTERS as readonly string[]).includes(examRaw)
    ? (examRaw as CaseExamFilter)
    : "any";
  const pageRaw = Number(url.searchParams.get("case_page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  return { q, court, exam, sort, page, pageSize: 50 };
}

const PROBLEM_ORIGINS: readonly ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const PROBLEM_FORMATS: readonly ProblemFormat[] = [
  "mc_short",
  "mc_box",
  "mc_case",
  "ox",
  "blank",
  "subjective",
];
const PROBLEM_POLARITIES: readonly ProblemPolarity[] = ["positive", "negative"];
const PROBLEM_SCOPES: readonly ProblemScope[] = ["unit", "comprehensive"];
const DIFFICULTY_FILTER_VALUES = [
  "very_easy",
  "easy",
  "medium",
  "hard",
  "very_hard",
  "no_data",
] as const;
const PROBLEM_SORTS: readonly ProblemSort[] = [
  "number",
  "hardest",
  "easiest",
  "newest",
];

function parseProblemFilters(url: URL): ProblemFiltersApplied {
  const f: ProblemFiltersApplied = {};
  const origin = url.searchParams.get("p_origin");
  if (origin && (PROBLEM_ORIGINS as readonly string[]).includes(origin)) {
    f.origin = origin as ProblemOrigin;
  }
  const yearStr = url.searchParams.get("p_year");
  if (yearStr && /^\d{4}$/.test(yearStr)) f.year = Number(yearStr);
  const round = url.searchParams.get("p_round");
  if (round === "first" || round === "second") {
    f.examRound = round;
  }
  const format = url.searchParams.get("p_format");
  if (format && (PROBLEM_FORMATS as readonly string[]).includes(format)) {
    f.format = format as ProblemFormat;
  }
  const polarity = url.searchParams.get("p_polarity");
  if (
    polarity &&
    (PROBLEM_POLARITIES as readonly string[]).includes(polarity)
  ) {
    f.polarity = polarity as ProblemPolarity;
  }
  const scope = url.searchParams.get("p_scope");
  if (scope && (PROBLEM_SCOPES as readonly string[]).includes(scope)) {
    f.scope = scope as ProblemScope;
  }
  const difficulty = url.searchParams.get("p_difficulty");
  if (
    difficulty &&
    (DIFFICULTY_FILTER_VALUES as readonly string[]).includes(difficulty)
  ) {
    f.difficulty = difficulty as DifficultyBucket | "no_data";
  }
  const sort = url.searchParams.get("p_sort");
  if (sort && (PROBLEM_SORTS as readonly string[]).includes(sort)) {
    f.sort = sort as ProblemSort;
  }
  const search = url.searchParams.get("p_search");
  if (search && search.trim().length > 0) {
    f.search = search.trim().slice(0, 100); // 길이 제한.
  }
  return f;
}

export async function loadSubjectHub(
  request: Request,
  lawCode: LawSubjectSlug,
): Promise<SubjectHubData & { caseQuery: string }> {
  const url = new URL(request.url);
  const caseFilters = parseCaseFilters(url);
  const caseQuery = caseFilters.q;
  const problemFilters = parseProblemFilters(url);

  const [client] = makeServerClient(request);
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    return {
      law: null,
      articles: [],
      systematicNodes: [],
      cases: [],
      casesTotal: 0,
      caseFilters,
      problems: [],
      recentRevisionDate: null,
      progress: null,
      bookmarkLevels: {},
      annotationCounts: {},
      caseQuery,
      problemYears: [],
      problemFilters,
      problemStats: null,
      problemAggStats: {},
      recommendedArticles: [],
    };
  }
  const [
    articles,
    systematicNodes,
    casesPage,
    problems,
    recentRevisionDate,
    problemYears,
  ] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    listCasesBySubject(client, lawCode, {
      query: caseFilters.q || undefined,
      sort: caseFilters.sort,
      court: caseFilters.court,
      examFilter: caseFilters.exam,
      page: caseFilters.page,
      pageSize: caseFilters.pageSize,
    }),
    listProblemsBySubject(client, lawCode, problemFilters),
    getLatestPublishedRevisionDate(client, law.lawId),
    listProblemYears(client, lawCode),
  ]);
  const cases = casesPage.items;
  const casesTotal = casesPage.total;

  const totalArticleCount = articles.filter((a) => a.level === "article").length;

  const {
    data: { user },
  } = await client.auth.getUser();
  const [
    progress,
    bookmarkLevels,
    annotationCounts,
    problemStats,
    recommendedArticles,
  ] = user
    ? await Promise.all([
        getSubjectProgress(client, user.id, lawCode, totalArticleCount),
        getUserArticleBookmarkLevels(client, user.id),
        getUserArticleAnnotationCounts(client, user.id),
        getUserProblemStats(client, user.id, lawCode),
        getRecommendedArticles(client, user.id, lawCode, 6),
      ])
    : [null, {}, {}, null, []];

  // 표시되는 문제 ID 들의 전체 사용자 정답률 집계 (난이도 뱃지용).
  const aggMap = await getProblemStatsBulk(
    client,
    problems.map((p) => p.problemId),
  );
  const problemAggStats: Record<string, ProblemAggregateStats> = {};
  for (const [pid, stats] of aggMap) problemAggStats[pid] = stats;

  // 난이도 필터 + 정렬은 aggStats 조회 후 후처리.
  let displayedProblems = problems;
  if (problemFilters.difficulty) {
    displayedProblems = displayedProblems.filter((p) => {
      const agg = problemAggStats[p.problemId];
      if (problemFilters.difficulty === "no_data") {
        return !agg || agg.bucket === null;
      }
      return agg?.bucket === problemFilters.difficulty;
    });
  }
  const sort = problemFilters.sort ?? "number";
  if (sort !== "number") {
    displayedProblems = [...displayedProblems].sort((a, b) => {
      if (sort === "newest") {
        const ya = a.year ?? 0;
        const yb = b.year ?? 0;
        if (ya !== yb) return yb - ya;
        return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
      }
      const accA = problemAggStats[a.problemId]?.accuracyPct;
      const accB = problemAggStats[b.problemId]?.accuracyPct;
      // null (데이터 없음) 은 항상 뒤로.
      if (accA === null || accA === undefined) return 1;
      if (accB === null || accB === undefined) return -1;
      return sort === "hardest" ? accA - accB : accB - accA;
    });
  }

  return {
    law,
    articles,
    systematicNodes,
    cases,
    casesTotal,
    caseFilters,
    problems: displayedProblems,
    recentRevisionDate,
    progress,
    bookmarkLevels,
    annotationCounts,
    caseQuery,
    problemYears,
    problemFilters,
    problemStats,
    problemAggStats,
    recommendedArticles,
  };
}

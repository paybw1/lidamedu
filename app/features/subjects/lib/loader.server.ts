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
  getCaseCountsByArticle,
  getCaseIdsByArticleIds,
  listCasesBySubject,
  type CaseCourtFilter,
  type CaseExamFilter,
  type CaseListItem,
  type CaseSubjectSort,
} from "~/features/cases/queries.server";
import {
  getSystematicNodeProblemStats,
  listProblemsBySubject,
  listProblemYears,
  type ProblemListItem,
  type SystematicNodeProblemStat,
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
import { buildNodeProgressByArticle } from "~/features/subjects/lib/node-progress.server";
import type { NodeProgressByArticle } from "~/features/subjects/components/node-progress-gauge";
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

// 판례 트리 진입 (feat-4-A-210) — 세 종류 활성 필터 중 하나만.
// articleId/chapterId 는 articles.article_id, nodeId 는 systematic_nodes.node_id.
export type CaseTreeFilter =
  | { kind: "article"; articleId: string }
  | { kind: "chapter"; chapterId: string }
  | { kind: "node"; nodeId: string };

export interface CaseFiltersApplied {
  q: string;
  court: CaseCourtFilter;
  exam: CaseExamFilter;
  sort: CaseSubjectSort;
  tree?: CaseTreeFilter;
}

export interface CaseTreeCounts {
  // articleId → 직접 연결된 판례 수
  byArticleId: Record<string, number>;
  // chapter/section/part articleId → 자손 article 합산
  byChapterId: Record<string, number>;
  // systematic_nodes.node_id → 부분트리 article 합산 (중복 제거)
  byNodeId: Record<string, number>;
}

export interface SubjectHubData {
  law: LawHeader | null;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  cases: CaseListItem[];
  casesTotal: number;
  caseFilters: CaseFiltersApplied;
  caseTreeCounts: CaseTreeCounts;
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
  progressByArticle: NodeProgressByArticle;
  // 체계도 노드별 {문제 수, 첫 문제 ID} — 문제 탭 좌측 트리용.
  systematicNodeProblemStats: Record<string, SystematicNodeProblemStat>;
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
  // 트리 필터 — 우선순위 article > chapter > node (한 번에 하나만 활성).
  const articleId = url.searchParams.get("case_article")?.trim();
  const chapterId = url.searchParams.get("case_chapter")?.trim();
  const nodeId = url.searchParams.get("case_node")?.trim();
  let tree: CaseTreeFilter | undefined;
  if (articleId) tree = { kind: "article", articleId };
  else if (chapterId) tree = { kind: "chapter", chapterId };
  else if (nodeId) tree = { kind: "node", nodeId };
  return { q, court, exam, sort, tree };
}

// articles 트리에서 한 노드 + 모든 자손 article 의 articleId 목록.
function descendantArticleIds(
  articles: ArticleNode[],
  rootId: string,
): string[] {
  const root = articles.find((a) => a.articleId === rootId);
  if (!root) return [];
  const prefix = `${root.path}.`;
  const out: string[] = [];
  for (const a of articles) {
    if (a.level !== "article") continue;
    if (a.path === root.path || a.path.startsWith(prefix)) {
      out.push(a.articleId);
    }
  }
  return out;
}

// systematic 부분트리에 속하는 모든 article id (중복 제거).
function systematicSubtreeArticleIds(
  nodes: SystematicNode[],
  rootNodeId: string,
): string[] {
  const root = nodes.find((n) => n.nodeId === rootNodeId);
  if (!root) return [];
  const prefix = `${root.path}.`;
  const set = new Set<string>();
  for (const n of nodes) {
    if (n.path !== root.path && !n.path.startsWith(prefix)) continue;
    for (const a of n.articles) set.add(a.articleId);
  }
  return [...set];
}

function aggregateChapterCounts(
  articles: ArticleNode[],
  byArticleId: Record<string, number>,
): Record<string, number> {
  const childrenByParent = new Map<string | null, ArticleNode[]>();
  for (const a of articles) {
    const list = childrenByParent.get(a.parentId) ?? [];
    list.push(a);
    childrenByParent.set(a.parentId, list);
  }
  const cache = new Map<string, number>();
  function sum(node: ArticleNode): number {
    const cached = cache.get(node.articleId);
    if (cached !== undefined) return cached;
    let total =
      node.level === "article" ? byArticleId[node.articleId] ?? 0 : 0;
    for (const c of childrenByParent.get(node.articleId) ?? []) {
      total += sum(c);
    }
    cache.set(node.articleId, total);
    return total;
  }
  const out: Record<string, number> = {};
  for (const a of articles) {
    if (a.level === "article") continue;
    const v = sum(a);
    if (v > 0) out[a.articleId] = v;
  }
  return out;
}

function aggregateSystematicNodeCounts(
  nodes: SystematicNode[],
  byArticleId: Record<string, number>,
): Record<string, number> {
  const childrenByParent = new Map<string | null, SystematicNode[]>();
  for (const n of nodes) {
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n);
    childrenByParent.set(n.parentId, list);
  }
  const cache = new Map<string, Set<string>>();
  function subtree(node: SystematicNode): Set<string> {
    const cached = cache.get(node.nodeId);
    if (cached) return cached;
    const set = new Set<string>();
    for (const a of node.articles) set.add(a.articleId);
    for (const c of childrenByParent.get(node.nodeId) ?? []) {
      for (const id of subtree(c)) set.add(id);
    }
    cache.set(node.nodeId, set);
    return set;
  }
  const out: Record<string, number> = {};
  for (const n of nodes) {
    let total = 0;
    for (const id of subtree(n)) total += byArticleId[id] ?? 0;
    if (total > 0) out[n.nodeId] = total;
  }
  return out;
}

// case 트리(조문·장·체계도) 노드별 판례 수 — subjects 허브와 case-viewer 가 공유.
export function buildCaseTreeCounts(
  articles: ArticleNode[],
  systematicNodes: SystematicNode[],
  caseCountsByArticle: Record<string, number>,
): CaseTreeCounts {
  return {
    byArticleId: caseCountsByArticle,
    byChapterId: aggregateChapterCounts(articles, caseCountsByArticle),
    byNodeId: aggregateSystematicNodeCounts(
      systematicNodes,
      caseCountsByArticle,
    ),
  };
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
      systematicNodeProblemStats: {},
      cases: [],
      casesTotal: 0,
      caseFilters,
      caseTreeCounts: { byArticleId: {}, byChapterId: {}, byNodeId: {} },
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
      progressByArticle: {} as NodeProgressByArticle,
    };
  }
  // 1단계 — 트리/판례 카운트 등 case-filter 결정에 선행해야 하는 데이터.
  const [articles, systematicNodes, caseCountsByArticle] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getCaseCountsByArticle(client, law.lawId),
  ]);

  // 트리 필터 → 대상 article id 셋 → case id 셋.
  let filterCaseIds: string[] | null = null;
  if (caseFilters.tree) {
    let targetArticleIds: string[] = [];
    if (caseFilters.tree.kind === "article") {
      targetArticleIds = [caseFilters.tree.articleId];
    } else if (caseFilters.tree.kind === "chapter") {
      targetArticleIds = descendantArticleIds(
        articles,
        caseFilters.tree.chapterId,
      );
    } else {
      targetArticleIds = systematicSubtreeArticleIds(
        systematicNodes,
        caseFilters.tree.nodeId,
      );
    }
    filterCaseIds =
      targetArticleIds.length === 0
        ? []
        : await getCaseIdsByArticleIds(client, targetArticleIds);
  }

  // 2단계 — case 목록, 문제, 최신 개정.
  const [
    casesPage,
    problems,
    recentRevisionDate,
    problemYears,
    systematicNodeProblemStats,
  ] = await Promise.all([
      listCasesBySubject(client, lawCode, {
        query: caseFilters.q || undefined,
        sort: caseFilters.sort,
        court: caseFilters.court,
        examFilter: caseFilters.exam,
        filterCaseIds,
      }),
      listProblemsBySubject(client, lawCode, problemFilters),
      getLatestPublishedRevisionDate(client, law.lawId),
      listProblemYears(client, lawCode),
      getSystematicNodeProblemStats(client, lawCode),
    ]);
  const cases = casesPage.items;
  const casesTotal = casesPage.total;

  const caseTreeCounts = buildCaseTreeCounts(
    articles,
    systematicNodes,
    caseCountsByArticle,
  );

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
    progressByArticle,
  ] = user
    ? await Promise.all([
        getSubjectProgress(client, user.id, lawCode, totalArticleCount),
        getUserArticleBookmarkLevels(client, user.id),
        getUserArticleAnnotationCounts(client, user.id),
        getUserProblemStats(client, user.id, lawCode),
        getRecommendedArticles(client, user.id, lawCode, 6),
        buildNodeProgressByArticle(
          client,
          user.id,
          articles.filter((a) => a.level === "article").map((a) => a.articleId),
        ),
      ])
    : [null, {}, {}, null, [], {} as NodeProgressByArticle];

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
    systematicNodeProblemStats,
    cases,
    casesTotal,
    caseFilters,
    caseTreeCounts,
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
    progressByArticle,
  };
}

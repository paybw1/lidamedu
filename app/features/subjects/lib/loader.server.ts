import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug, SubjectTab } from "./subjects";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  type ArticleAnnotationCounts,
  getUserArticleAnnotationCounts,
  getUserArticleBookmarkLevels,
  listBookmarkedCaseIds,
  listBookmarkedProblems,
} from "~/features/annotations/queries.server";
import {
  type CaseCourtFilter,
  type CaseExamFilter,
  type CaseListItem,
  type CaseSubjectSort,
  getCaseIdsByArticleLinks,
  getCaseIdsByPlacement,
  getCasePlacementMaps,
  listCasesBySubject,
} from "~/features/cases/queries.server";
import {
  type ArticleNode,
  type LawHeader,
  type SystematicNode,
  getArticleSkeleton,
  getLatestPublishedRevisionDate,
  getLawByCode,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import type {
  ProblemExamRound,
  ProblemFormat,
  ProblemOrigin,
  ProblemPolarity,
  ProblemScope,
} from "~/features/problems/labels";
import {
  type ProblemListItem,
  type SystematicNodeProblemStat,
  getSystematicNodeProblemSequence,
  getSystematicNodeProblemStats,
  listProblemYears,
  listProblemsBySubject,
} from "~/features/problems/queries.server";
import type {
  DifficultyBucket,
  ProblemAggregateStats,
} from "~/features/study/lib/difficulty";
import {
  type RecommendedArticleItem,
  type SubjectProgress,
  type UserProblemStats,
  getProblemStatsBulk,
  getRecommendedArticles,
  getSubjectProgress,
  getUserProblemStats,
} from "~/features/study/queries.server";
import type { NodeProgressByArticle } from "~/features/subjects/components/node-progress-gauge";
import { buildNodeProgressByArticle } from "~/features/subjects/lib/node-progress.server";

export type ProblemSort = "number" | "hardest" | "easiest" | "newest";

export interface ProblemFiltersApplied {
  origin?: ProblemOrigin;
  // "기출" 선택 시 기출+기출변형 한 묶음 조회용(과목 뷰 한정). UI 는 origin 만 사용.
  origins?: ProblemOrigin[];
  year?: number;
  examRound?: ProblemExamRound;
  format?: ProblemFormat;
  polarity?: ProblemPolarity;
  scope?: ProblemScope;
  difficulty?: DifficultyBucket | "no_data";
  sort?: ProblemSort;
  search?: string;
  // 수험생 즐겨찾기 최소 별점 (1~5) — ?p_bookmarked=N.
  bookmarkMin?: number;
  // 강사 체크 중요도 최소 별 (1~3) — ?p_importance=N.
  importanceMin?: number;
}

// 문제 탭 체계도 트리 필터 — 노드 클릭 시 그 노드 subtree 의 문제만 표시.
export interface ProblemNodeFilter {
  nodeId: string;
  label: string;
  // 노드 subtree 의 첫 문제 — "이 체계 풀기" 러너 진입점. 0건이면 null.
  firstProblemId: string | null;
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
  // 수험생 즐겨찾기 최소 별점 (0=전체, 1~5) — ?case_bookmarked=N.
  bookmarkMin: number;
  // 강사 체크 중요도 최소 별 (0=전체, 1~3) — ?case_importance=N.
  importanceMin: number;
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
  // 문제 탭 체계도 노드 필터 (?node=) — 미적용/무효 노드면 null.
  problemNodeFilter: ProblemNodeFilter | null;
  // 책갈피 레일 3축 총량(필터 무관 head-count). BookmarkTab 옆 카운트 표시용.
  axisCounts: Record<SubjectTab, number>;
}

const CASE_SORTS: readonly CaseSubjectSort[] = [
  "decided_desc",
  "decided_asc",
  "case_no",
  "source_asc",
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

// 단계 필터 파라미터 파싱 — 1..max 정수만 유효, 그 외(빈값/0/범위초과)는 0(=전체).
function parseLevel(raw: string | null, max: number): number {
  const n = Number(raw ?? "");
  return Number.isInteger(n) && n >= 1 && n <= max ? n : 0;
}

function parseCaseFilters(url: URL): CaseFiltersApplied {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
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
  // 정렬 기본값 — 트리 축 별 (case_sort 미지정 시):
  //   • node 클릭 (체계도 axis) → source_asc (원본 자료 순서, created_at ASC).
  //     같은 systematic 노드 안에서는 시드 시점의 학습 순서대로 정렬.
  //   • article / chapter 클릭 (조문 axis) → decided_desc (최신 판례 우선).
  //     조문은 최신 해석부터 보는 게 자연스럽다.
  //   • 트리 미적용 (전체 목록·검색) → decided_desc.
  // 사용자가 정렬 옵션을 직접 바꾸면 그 값이 우선(case_sort URL param 으로 명시).
  const sortRaw = url.searchParams.get("case_sort");
  let sort: CaseSubjectSort;
  if (sortRaw && (CASE_SORTS as readonly string[]).includes(sortRaw)) {
    sort = sortRaw as CaseSubjectSort;
  } else if (tree?.kind === "node") {
    sort = "source_asc";
  } else {
    sort = "decided_desc";
  }
  const bookmarkMin = parseLevel(url.searchParams.get("case_bookmarked"), 5);
  const importanceMin = parseLevel(url.searchParams.get("case_importance"), 3);
  return { q, court, exam, sort, tree, bookmarkMin, importanceMin };
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
// case-viewer 의 prev/next 형제 계산에서도 재사용 — cases-tab 의 노드 필터와
// 동일 로직으로 정합성 유지(목록 7건 ↔ viewer 7건).
export function systematicSubtreeArticleIds(
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

// systematic 부분트리에 속하는 모든 node id (자신 + 자손) — case_systematic_links 직접
// 매핑 검색 시 사용. case 가 sub-node 에 분류되어 있어도 부모 노드 필터링에 잡힘.
// case-viewer 의 prev/next 에서도 재사용.
export function systematicSubtreeNodeIds(
  nodes: SystematicNode[],
  rootNodeId: string,
): string[] {
  const root = nodes.find((n) => n.nodeId === rootNodeId);
  if (!root) return [];
  const prefix = `${root.path}.`;
  const out: string[] = [];
  for (const n of nodes) {
    if (n.path === root.path || n.path.startsWith(prefix)) out.push(n.nodeId);
  }
  return out;
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
      node.level === "article" ? (byArticleId[node.articleId] ?? 0) : 0;
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

// 체계도 노드 카운트 — placement 단위 distinct case 합산.
// 입력: caseSetByNodeId(node 직접 매핑된 case id 들). 부모 노드는 자손 case set union → size.
function aggregateSystematicNodeCounts(
  nodes: SystematicNode[],
  caseSetByNodeId: Record<string, string[]>,
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
    const set = new Set<string>(caseSetByNodeId[node.nodeId] ?? []);
    for (const c of childrenByParent.get(node.nodeId) ?? []) {
      for (const id of subtree(c)) set.add(id);
    }
    cache.set(node.nodeId, set);
    return set;
  }
  const out: Record<string, number> = {};
  for (const n of nodes) {
    const size = subtree(n).size;
    if (size > 0) out[n.nodeId] = size;
  }
  return out;
}

// articleId 별 case 수도 placement 단위 — caseSet 의 size.
function caseSetToCounts(
  caseSet: Record<string, string[]>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(caseSet)) out[k] = v.length;
  return out;
}

// case 트리(조문·장·체계도) 노드별 판례 수 — subjects 허브와 case-viewer 가 공유.
export function buildCaseTreeCounts(
  articles: ArticleNode[],
  systematicNodes: SystematicNode[],
  caseSetByArticleId: Record<string, string[]> = {},
  caseSetByNodeId: Record<string, string[]> = {},
): CaseTreeCounts {
  const byArticleId = caseSetToCounts(caseSetByArticleId);
  return {
    byArticleId,
    byChapterId: aggregateChapterCounts(articles, byArticleId),
    byNodeId: aggregateSystematicNodeCounts(systematicNodes, caseSetByNodeId),
  };
}

/**
 * 책갈피 레일 3축 카운트 — 조문·판례·문제 총개수. 상세 뷰어 레일이 허브처럼
 * 라벨 밑에 콘텐츠 수를 보이도록 각 뷰어 loader 가 호출한다. `head: true`
 * count 쿼리라 행은 가져오지 않는다(가벼움).
 */
export async function getSubjectAxisCounts(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  lawId: string,
): Promise<Record<SubjectTab, number>> {
  const [articles, cases, problems] = await Promise.all([
    client
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("law_id", lawId)
      .eq("level", "article"),
    client
      .from("cases")
      .select("*", { count: "exact", head: true })
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null),
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", lawId)
      .is("deleted_at", null),
  ]);
  return {
    articles: articles.count ?? 0,
    cases: cases.count ?? 0,
    problems: problems.count ?? 0,
  };
}

const PROBLEM_ORIGINS: readonly ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];

// 학습과목 문제탭: "기출"은 기출 + 기출변형을 한 묶음으로(과목 뷰 한정).
//   admin·맞춤퀴즈는 listProblemsBySubject 를 origin(exact) 으로 그대로 호출 — 여기서만 그룹 확장.
const PAST_EXAM_GROUP: ProblemOrigin[] = ["past_exam", "past_exam_variant"];
function groupPastExamOrigin(f: ProblemFiltersApplied): ProblemFiltersApplied {
  if (f.origin === "past_exam" || f.origin === "past_exam_variant") {
    return { ...f, origin: undefined, origins: PAST_EXAM_GROUP };
  }
  return f;
}
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
  const bm = parseLevel(url.searchParams.get("p_bookmarked"), 5);
  if (bm > 0) f.bookmarkMin = bm;
  const im = parseLevel(url.searchParams.get("p_importance"), 3);
  if (im > 0) f.importanceMin = im;
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
  const problemNodeId = url.searchParams.get("node")?.trim() || null;
  // case 트리 필터(case_node/case_article/case_chapter) 는 cases 탭에 있을
  // 때만 cases 목록·총카운트에 적용한다. articles/problems 탭으로 전환하면
  // 책갈피 레일의 "판례 N" 카운트가 그 노드의 필터된 수에 갇혀 stale 처럼
  // 보였던 문제 해결.
  const activeTabIsCases = url.searchParams.get("tab") === "cases";

  const [client] = makeServerClient(request);

  // Phase A2 — auth.getUser 는 lawCode/lawId 의존성이 없어 처음부터 병렬 시작.
  // Stage 3 진입 시점엔 이미 완료돼 RTT 1단 감축. (law 없는 early-return 경로는
  // seed 직후 1회뿐이지만 unhandled rejection 방지로 catch 처리.)
  const authPromise = client.auth.getUser();

  const law = await getLawByCode(client, lawCode);
  if (!law) {
    await authPromise.catch(() => {});
    return {
      law: null,
      articles: [],
      systematicNodes: [],
      systematicNodeProblemStats: {},
      problemNodeFilter: null,
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
      axisCounts: { articles: 0, cases: 0, problems: 0 },
    };
  }
  // 1단계 — 트리/판례 카운트 등 case-filter 결정에 선행해야 하는 데이터.
  // placement maps 는 case 의 primary_* 단일 분류 기반 — 트리 카운트와 listing 의
  // 정합성을 위해 함께 사용.
  // totalCaseCount 는 헤더 "내 학습 현황" 의 판례 진도% 분모. 필터 무관한
  // 전체 카운트라 listCasesBySubject 의 total(필터 적용 결과)과는 다르다.
  const [
    articles,
    systematicNodes,
    placementMaps,
    totalCaseCountRes,
    totalProblemCountRes,
  ] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getCasePlacementMaps(client, lawCode, law.lawId),
    client
      .from("cases")
      .select("*", { count: "exact", head: true })
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null),
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", law.lawId)
      .is("deleted_at", null),
  ]);
  const totalCaseCount = totalCaseCountRes.count ?? 0;
  const totalProblemCount = totalProblemCountRes.count ?? 0;

  // Phase A2 — authPromise 는 Stage 1 과 겹쳐 보통 이 시점에 완료. 즐겨찾기 필터가
  // case 목록 쿼리(Stage 2)에 선행해야 하므로 user 를 여기서 확정한다.
  const {
    data: { user },
  } = await authPromise;

  // 트리 필터 → case id 셋. 축에 따라 다른 정책:
  //   • article / chapter (조문 axis) → article_case_links many-to-many
  //     (한 case 가 여러 article 에 연결되어 있으면 각 위치에서 모두 잡힘).
  //   • node (체계도 axis) → primary placement (단일 배치).
  // 활성 탭이 cases 가 아니면 필터 무시 — 책갈피 cases 카운트는 전체 기준.
  let filterCaseIds: string[] | null = null;
  if (activeTabIsCases) {
    if (caseFilters.tree) {
      if (caseFilters.tree.kind === "article") {
        filterCaseIds = await getCaseIdsByArticleLinks(client, [
          caseFilters.tree.articleId,
        ]);
      } else if (caseFilters.tree.kind === "chapter") {
        filterCaseIds = await getCaseIdsByArticleLinks(
          client,
          descendantArticleIds(articles, caseFilters.tree.chapterId),
        );
      } else {
        const targetArticleIds = systematicSubtreeArticleIds(
          systematicNodes,
          caseFilters.tree.nodeId,
        );
        const nodeIds = systematicSubtreeNodeIds(
          systematicNodes,
          caseFilters.tree.nodeId,
        );
        filterCaseIds = await getCaseIdsByPlacement(
          client,
          targetArticleIds,
          nodeIds,
        );
      }
    }
    // 즐겨찾기 N+ — 트리 필터와 교집합(둘 다 활성이면), 단독이면 즐겨찾기 case 집합.
    // 미로그인 / 해당 별점 0건이면 빈 배열 → listCasesBySubject 가 빈 결과 반환.
    if (caseFilters.bookmarkMin > 0) {
      const bookmarkedIds = user
        ? await listBookmarkedCaseIds(client, user.id, caseFilters.bookmarkMin)
        : [];
      if (filterCaseIds === null) {
        filterCaseIds = bookmarkedIds;
      } else {
        const bset = new Set(bookmarkedIds);
        filterCaseIds = filterCaseIds.filter((id) => bset.has(id));
      }
    }
  }

  // 2단계 — case 목록, 문제, 최신 개정.
  const [
    casesPage,
    problems,
    recentRevisionDate,
    problemYears,
    systematicNodeProblemStats,
    problemNodeSeq,
  ] = await Promise.all([
    listCasesBySubject(client, lawCode, {
      query: caseFilters.q || undefined,
      sort: caseFilters.sort,
      court: caseFilters.court,
      examFilter: caseFilters.exam,
      filterCaseIds,
      importanceMin: caseFilters.importanceMin || undefined,
    }),
    listProblemsBySubject(client, lawCode, groupPastExamOrigin(problemFilters)),
    getLatestPublishedRevisionDate(client, law.lawId),
    listProblemYears(client, lawCode),
    getSystematicNodeProblemStats(client, lawCode),
    problemNodeId
      ? getSystematicNodeProblemSequence(client, problemNodeId)
      : Promise.resolve(null),
  ]);
  const cases = casesPage.items;
  const casesTotal = casesPage.total;

  const caseTreeCounts = buildCaseTreeCounts(
    articles,
    systematicNodes,
    placementMaps.caseSetByArticleId,
    placementMaps.caseSetByNodeId,
  );

  const totalArticleCount = articles.filter(
    (a) => a.level === "article",
  ).length;

  // user 는 위(Stage 1 직후)에서 이미 확정 — 즐겨찾기 case 필터가 Stage 2 에 선행해야 해서.
  const [
    progress,
    bookmarkLevels,
    annotationCounts,
    problemStats,
    recommendedArticles,
    progressByArticle,
  ] = user
    ? await Promise.all([
        getSubjectProgress(
          client,
          user.id,
          lawCode,
          totalArticleCount,
          totalCaseCount,
        ),
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

  // 즐겨찾기 별점 N+ 문제로 한정 (post-filter, 해당 과목 scope).
  // 미로그인 / 해당 별점 0건이면 빈 집합 → 결과 0.
  if (problemFilters.bookmarkMin && problemFilters.bookmarkMin > 0) {
    const refs = user
      ? await listBookmarkedProblems(client, user.id, {
          lawCode,
          minStar: problemFilters.bookmarkMin,
        })
      : [];
    const bset = new Set(refs.map((r) => r.problemId));
    displayedProblems = displayedProblems.filter((p) => bset.has(p.problemId));
  }
  // 중요도 N+ 문제로 한정 (강사 체크 별).
  if (problemFilters.importanceMin && problemFilters.importanceMin > 0) {
    const min = problemFilters.importanceMin;
    displayedProblems = displayedProblems.filter((p) => p.importance >= min);
  }

  // 체계도 노드 필터 — 노드 subtree 의 문제만. (?node= 무효 시 problemNodeSeq=null → 무시)
  let problemNodeFilter: ProblemNodeFilter | null = null;
  if (problemNodeSeq) {
    const nodeProblemIds = new Set(
      problemNodeSeq.problems.map((p) => p.problemId),
    );
    displayedProblems = displayedProblems.filter((p) =>
      nodeProblemIds.has(p.problemId),
    );
    problemNodeFilter = {
      nodeId: problemNodeSeq.node.nodeId,
      label: problemNodeSeq.node.displayLabel,
      firstProblemId: problemNodeSeq.problems[0]?.problemId ?? null,
    };
  }

  return {
    law,
    articles,
    systematicNodes,
    systematicNodeProblemStats,
    problemNodeFilter,
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
    axisCounts: {
      articles: totalArticleCount,
      cases: totalCaseCount,
      problems: totalProblemCount,
    },
    problemYears,
    problemFilters,
    problemStats,
    problemAggStats,
    recommendedArticles,
    progressByArticle,
  };
}

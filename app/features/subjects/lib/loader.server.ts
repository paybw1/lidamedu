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
  computeCaseOverallOrder,
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
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import {
  FORMAT_SORT_ORDER,
  ORIGIN_SORT_ORDER,
  POLARITY_SORT_ORDER,
  PROBLEM_SORT_DEFAULT_DIR,
  PROBLEM_SORT_KEYS,
  type ProblemExamRound,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
  type ProblemSortDir,
  type ProblemSortKey,
  SCOPE_SORT_ORDER,
} from "~/features/problems/labels";
import {
  type ProblemListItem,
  type SystematicNodeProblemStat,
  attachProblemOverallNo,
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

// 정렬 키 = 컬럼(색인 기준). 방향(asc/desc)은 sortDir 로 분리(컬럼 헤더 클릭 토글).
export type ProblemSort = ProblemSortKey;

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
  sortDir?: ProblemSortDir;
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
  // 주관식 탭 게이트 — 고도화 전까지 staff 전용(학생은 레일에서 비활성).
  isStaff: boolean;
  // 주관식 학습 현황 — 문항별 답안 작성/제출(자기채점)/첨삭 완료 상태(user_subjective_attempts).
  subjectiveAttemptStatus: Record<
    string,
    { submitted: boolean; reviewed: boolean }
  >;
}

const CASE_SORTS: readonly CaseSubjectSort[] = [
  "overall_asc",
  "overall_desc",
  "decided_desc",
  "decided_asc",
  "case_no",
  "case_no_desc",
  "source_asc",
  // 컬럼 헤더 클릭 정렬 (cases-tab SortableCaseHead).
  "importance_desc",
  "importance_asc",
  "court_asc",
  "court_desc",
  "topic_asc",
  "topic_desc",
  "type_asc",
  "type_desc",
  "enbanc_desc",
  "enbanc_asc",
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
  } else if (tree) {
    // 조문/장 axis(article·chapter) → 최신 해석부터 보는 게 자연스러움.
    sort = "decided_desc";
  } else {
    // 트리 미적용(전체 목록) → 체계도 전체 순번 순(문제 탭과 동일 방식).
    sort = "overall_asc";
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
  const [articles, cases, problems, subjective] = await Promise.all([
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
    // ★ 학습과목 문제탭 목록(listProblemsBySubject 기본)과 동일 가시성 필터로 카운트한다.
    //   review_status='approved'(검토 대기 draft 제외) + 미공개 mock 제외 → 탭 배지 수가
    //   실제 목록 수(예: 특허 1106)와 일치(이전엔 1112로 draft 6 포함되어 불일치).
    //   객관식(problems)=1차 / 주관식(subjective)=2차 — 레일 탭 분리와 동일 기준.
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", lawId)
      .is("deleted_at", null)
      .eq("review_status", "approved")
      .eq("exam_round", "first")
      .or("origin.neq.mock,released_at.not.is.null"),
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", lawId)
      .is("deleted_at", null)
      .eq("review_status", "approved")
      .eq("exam_round", "second")
      .or("origin.neq.mock,released_at.not.is.null"),
  ]);
  return {
    articles: articles.count ?? 0,
    cases: cases.count ?? 0,
    problems: problems.count ?? 0,
    subjective: subjective.count ?? 0,
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
const PROBLEM_SORTS: readonly ProblemSort[] = PROBLEM_SORT_KEYS;

export function parseProblemFilters(url: URL): ProblemFiltersApplied {
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
  const dir = url.searchParams.get("p_dir");
  if (dir === "asc" || dir === "desc") f.sortDir = dir;
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

// 문제 목록 표시 파이프라인(순수) — 난이도 필터 → 정렬 → 즐겨찾기 → 중요도 → 단원.
// 학습과목 탭(loadSubjectHub)과 문제 뷰어 prev/next(listDisplayedProblems)가 공유해
// "표시 목록 순서 == prev/next 순서" 정합을 보장한다(feat: 색인 그룹 내 prev/next).
export function applyProblemListView(
  problems: ProblemListItem[],
  aggStats: Record<string, ProblemAggregateStats>,
  filters: ProblemFiltersApplied,
  ctx: { bookmarkedIds: Set<string> | null; nodeProblemIds: Set<string> | null },
): ProblemListItem[] {
  let out = problems;
  if (filters.difficulty) {
    out = out.filter((p) => {
      const agg = aggStats[p.problemId];
      if (filters.difficulty === "no_data") return !agg || agg.bucket === null;
      return agg?.bucket === filters.difficulty;
    });
  }
  // 컬럼(색인 기준) 정렬 — 키 + 방향(asc/desc). 미지정이면 listProblemsBySubject 기본순(시드순).
  if (filters.sort) {
    const key = filters.sort;
    const dir = filters.sortDir ?? PROBLEM_SORT_DEFAULT_DIR[key];
    const mul = dir === "asc" ? 1 : -1;
    const valOf = (p: ProblemListItem): number | null => {
      switch (key) {
        case "overall":
          return p.overallNo ?? null;
        case "number":
          return p.problemNumber;
        case "year":
          return p.year;
        case "accuracy":
          return aggStats[p.problemId]?.accuracyPct ?? null;
        case "importance":
          return p.importance;
        case "origin":
          return ORIGIN_SORT_ORDER[p.origin];
        case "format":
          return FORMAT_SORT_ORDER[p.format];
        case "polarity":
          return p.polarity ? POLARITY_SORT_ORDER[p.polarity] : null;
        case "scope":
          return p.scope ? SCOPE_SORT_ORDER[p.scope] : null;
      }
    };
    out = [...out].sort((a, b) => {
      const va = valOf(a);
      const vb = valOf(b);
      // null(데이터 없음)은 방향 무관 항상 뒤로. 동순위는 번호 오름차순.
      if (va === null && vb === null)
        return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va !== vb) return va < vb ? -mul : mul;
      return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
    });
  }
  if (filters.bookmarkMin && filters.bookmarkMin > 0 && ctx.bookmarkedIds) {
    out = out.filter((p) => ctx.bookmarkedIds!.has(p.problemId));
  }
  if (filters.importanceMin && filters.importanceMin > 0) {
    const min = filters.importanceMin;
    out = out.filter((p) => p.importance >= min);
  }
  if (ctx.nodeProblemIds) {
    out = out.filter((p) => ctx.nodeProblemIds!.has(p.problemId));
  }
  return out;
}

// 문제 뷰어 prev/next 용 — 탭과 동일 조건(필터·정렬·단원)의 표시 목록을 그대로 재현.
// 뷰어 loader 가 ?list=1 + 필터 컨텍스트로 호출 → 인접 문제 = "그 색인 그룹" 이웃.
export async function listDisplayedProblems(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  filters: ProblemFiltersApplied,
  opts: { userId: string | null; nodeId: string | null },
): Promise<ProblemListItem[]> {
  const problems = await listProblemsBySubject(
    client,
    lawCode,
    groupPastExamOrigin(filters),
  );
  // 난이도 필터·난이도 정렬에만 aggStats 필요 — 그 외엔 생략(쿼리 절약).
  const aggStats: Record<string, ProblemAggregateStats> = {};
  const needsAgg = filters.difficulty != null || filters.sort === "accuracy";
  if (needsAgg) {
    const aggMap = await getProblemStatsBulk(
      client,
      problems.map((p) => p.problemId),
    );
    for (const [pid, s] of aggMap) aggStats[pid] = s;
  }
  let bookmarkedIds: Set<string> | null = null;
  if (filters.bookmarkMin && filters.bookmarkMin > 0) {
    const refs = opts.userId
      ? await listBookmarkedProblems(client, opts.userId, {
          lawCode,
          minStar: filters.bookmarkMin,
        })
      : [];
    bookmarkedIds = new Set(refs.map((r) => r.problemId));
  }
  let nodeProblemIds: Set<string> | null = null;
  if (opts.nodeId) {
    const seq = await getSystematicNodeProblemSequence(client, opts.nodeId);
    nodeProblemIds = seq
      ? new Set(seq.problems.map((p) => p.problemId))
      : new Set();
  }
  // 뷰어 prev/next 도 "전체" 정렬 시 같은 순서를 따르도록 overallNo 부여.
  await attachProblemOverallNo(client, lawCode, problems);
  return applyProblemListView(problems, aggStats, filters, {
    bookmarkedIds,
    nodeProblemIds,
  });
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
      axisCounts: { articles: 0, cases: 0, problems: 0, subjective: 0 },
      isStaff: false,
      subjectiveAttemptStatus: {},
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
    totalSubjectiveCountRes,
  ] = await Promise.all([
    getArticleSkeleton(client, law.lawId),
    getSystematicSkeleton(client, lawCode),
    getCasePlacementMaps(client, lawCode, law.lawId),
    client
      .from("cases")
      .select("*", { count: "exact", head: true })
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null),
    // ★ 책갈피 레일 "객관식 N" — getSubjectAxisCounts(뷰어 loader)와 동일 가시성
    //   필터(approved + 미공개 mock 제외)로 세야 허브·뷰어 간 카운트가 일치한다.
    //   deleted_at 만 걸면 검토대기 draft 6건이 포함돼 1112↔1106 로 왔다갔다 했다.
    //   객관식(1차)/주관식(2차) 레일 탭 분리에 맞춰 exam_round 로 나눠 센다.
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", law.lawId)
      .is("deleted_at", null)
      .eq("review_status", "approved")
      .eq("exam_round", "first")
      .or("origin.neq.mock,released_at.not.is.null"),
    client
      .from("problems")
      .select("*", { count: "exact", head: true })
      .eq("law_id", law.lawId)
      .is("deleted_at", null)
      .eq("review_status", "approved")
      .eq("exam_round", "second")
      .or("origin.neq.mock,released_at.not.is.null"),
  ]);
  const totalCaseCount = totalCaseCountRes.count ?? 0;
  const totalProblemCount = totalProblemCountRes.count ?? 0;
  const totalSubjectiveCount = totalSubjectiveCountRes.count ?? 0;

  // Phase A2 — authPromise 는 Stage 1 과 겹쳐 보통 이 시점에 완료. 즐겨찾기 필터가
  // case 목록 쿼리(Stage 2)에 선행해야 하므로 user 를 여기서 확정한다.
  const {
    data: { user },
  } = await authPromise;
  // 주관식 탭 게이트(고도화 전 staff 전용) — 레일 비활성 판정용.
  const staffRole = user ? await getStaffRole(client, user.id) : null;

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
  // 체계도 전체 순번(overallNo) — 노드 필터/정렬 전, 전과목 기준 1회 부여(파생값).
  await attachProblemOverallNo(client, lawCode, problems);
  const cases = casesPage.items;
  const casesTotal = casesPage.total;

  // 체계도 전체 순번(판례) — 전과목 기준 1회 계산 → 표시 항목에 부여. sort=overall 이면 재정렬.
  // (판례는 listCasesBySubject 가 overall 을 모르므로 여기서 in-memory 정렬한다.)
  const caseOverallMap = await computeCaseOverallOrder(
    client,
    lawCode,
    systematicNodes.map((n) => n.nodeId),
    placementMaps.caseSetByNodeId,
  );
  for (const c of cases) c.overallNo = caseOverallMap[c.caseId] ?? null;
  if (caseFilters.sort === "overall_asc") {
    cases.sort(
      (a, b) =>
        (a.overallNo ?? Number.POSITIVE_INFINITY) -
        (b.overallNo ?? Number.POSITIVE_INFINITY),
    );
  } else if (caseFilters.sort === "overall_desc") {
    cases.sort(
      (a, b) =>
        (b.overallNo ?? Number.NEGATIVE_INFINITY) -
        (a.overallNo ?? Number.NEGATIVE_INFINITY),
    );
  } else if (
    caseFilters.sort === "topic_asc" ||
    caseFilters.sort === "topic_desc"
  ) {
    // 주제(주제N 노드) 정렬 — primaryNodeId 의 "주제N" 번호 기준. 주제 미배치는 항상 뒤로,
    // 동률(같은 주제 안)은 체계도 순번(overallNo)으로 안정 정렬.
    const topicNoByNodeId = new Map<string, number>();
    for (const n of systematicNodes) {
      const m = /^주제\s*(\d+)/.exec(n.displayLabel);
      if (m) topicNoByNodeId.set(n.nodeId, Number(m[1]));
    }
    const topicNo = (c: (typeof cases)[number]) =>
      c.primaryNodeId ? topicNoByNodeId.get(c.primaryNodeId) : undefined;
    const dir = caseFilters.sort === "topic_asc" ? 1 : -1;
    cases.sort((a, b) => {
      const ta = topicNo(a);
      const tb = topicNo(b);
      if (ta === undefined && tb === undefined)
        return (
          (a.overallNo ?? Number.POSITIVE_INFINITY) -
          (b.overallNo ?? Number.POSITIVE_INFINITY)
        );
      if (ta === undefined) return 1;
      if (tb === undefined) return -1;
      if (ta !== tb) return (ta - tb) * dir;
      return (
        (a.overallNo ?? Number.POSITIVE_INFINITY) -
        (b.overallNo ?? Number.POSITIVE_INFINITY)
      );
    });
  }

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

  // 주관식 학습 현황 — 이 과목 주관식 문항별 답안 작성/제출/첨삭 상태.
  const subjectiveAttemptStatus: Record<
    string,
    { submitted: boolean; reviewed: boolean }
  > = {};
  if (user) {
    const { data: subjAttempts } = await client
      .from("user_subjective_attempts")
      .select(
        "problem_id, submitted_at, review_completed_at, problems!inner(law_id)",
      )
      .eq("user_id", user.id)
      .eq("problems.law_id", law.lawId)
      .is("deleted_at", null);
    for (const r of subjAttempts ?? []) {
      subjectiveAttemptStatus[r.problem_id] = {
        submitted: r.submitted_at != null,
        reviewed: r.review_completed_at != null,
      };
    }
  }

  // 표시되는 문제 ID 들의 전체 사용자 정답률 집계 (난이도 뱃지용).
  const aggMap = await getProblemStatsBulk(
    client,
    problems.map((p) => p.problemId),
  );
  const problemAggStats: Record<string, ProblemAggregateStats> = {};
  for (const [pid, stats] of aggMap) problemAggStats[pid] = stats;

  // 난이도/정렬/즐겨찾기/중요도/단원 표시 파이프라인 — applyProblemListView 공유
  //   (문제 뷰어 prev/next 와 동일 순서 보장). 즐겨찾기 집합은 여기서 fetch.
  let bookmarkedIds: Set<string> | null = null;
  if (problemFilters.bookmarkMin && problemFilters.bookmarkMin > 0) {
    const refs = user
      ? await listBookmarkedProblems(client, user.id, {
          lawCode,
          minStar: problemFilters.bookmarkMin,
        })
      : [];
    bookmarkedIds = new Set(refs.map((r) => r.problemId));
  }
  const nodeProblemIds = problemNodeSeq
    ? new Set(problemNodeSeq.problems.map((p) => p.problemId))
    : null;
  const displayedProblems = applyProblemListView(
    problems,
    problemAggStats,
    problemFilters,
    { bookmarkedIds, nodeProblemIds },
  );

  // 체계도 노드 필터 배너 (?node= 무효 시 problemNodeSeq=null → 미적용).
  const problemNodeFilter: ProblemNodeFilter | null = problemNodeSeq
    ? {
        nodeId: problemNodeSeq.node.nodeId,
        label: problemNodeSeq.node.displayLabel,
        firstProblemId: problemNodeSeq.problems[0]?.problemId ?? null,
      }
    : null;

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
      subjective: totalSubjectiveCount,
    },
    isStaff: staffRole !== null,
    subjectiveAttemptStatus,
    problemYears,
    problemFilters,
    problemStats,
    problemAggStats,
    recommendedArticles,
    progressByArticle,
  };
}

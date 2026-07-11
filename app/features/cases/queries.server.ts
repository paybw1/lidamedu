import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  CASE_COMMENT_LABEL_VALUES,
  parseBookSections,
  parseCaseImages,
  type CaseCommentLabel,
  type CaseCourt,
  type CaseDetail,
  type CaseListItem,
  type CaseReference,
  type CaseReferenceKind,
  type SummaryItem,
} from "./labels";

import { fetchAllIn, fetchAllPages } from "~/core/lib/supa-batch.server";
import type { ExamProblemRef } from "~/features/problems/labels";
import { getExamProblemsByCase } from "~/features/problems/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type {
  CaseCourt,
  CaseListItem,
  CaseDetail,
  SummaryItem,
  CaseReference,
  CaseReferenceKind,
} from "./labels";
export { COURT_LABELS } from "./labels";

// list 쿼리에서 select 하는 컬럼 묶음 — DRY.
const LIST_COLUMNS =
  "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, summary_items, subject_laws, exam_1st_years, exam_2nd_years, primary_node_id";

interface CaseListRow {
  case_id: string;
  court: CaseCourt;
  decided_at: string;
  case_number: string;
  case_title: string;
  nickname: string | null;
  case_type: string | null;
  is_en_banc: boolean;
  importance: number | null;
  summary_title: string | null;
  summary_items: unknown;
  subject_laws: string[];
  exam_1st_years: number[] | null;
  exam_2nd_years: number[] | null;
  // LIST_COLUMNS 외 컬럼 세트를 쓰는 호출부(최근 판례 등)가 있어 선택 필드.
  primary_node_id?: string | null;
}

function extractFirstSummaryTitle(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  const t = (first as Record<string, unknown>).title;
  if (typeof t !== "string") return null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rowToListItem(
  row: CaseListRow,
  examProblemsByCase?: Map<string, ExamProblemRef[]>,
): CaseListItem {
  const problems = examProblemsByCase?.get(row.case_id) ?? [];
  const problemYears = new Set(problems.map((p) => p.year));
  const extraYears = (row.exam_1st_years ?? []).filter(
    (y) => !problemYears.has(y),
  );
  return {
    caseId: row.case_id,
    overallNo: null,
    court: row.court,
    decidedAt: row.decided_at,
    caseNumber: row.case_number,
    caseTitle: row.case_title,
    nickname: row.nickname,
    caseType: row.case_type,
    isEnBanc: row.is_en_banc,
    importance: row.importance ?? 1,
    summaryTitle: row.summary_title,
    summaryFirstTitle: extractFirstSummaryTitle(row.summary_items),
    subjectLaws: row.subject_laws ?? [],
    // feat-8-024: 1차 기출문제는 problem_case_links 기반 파생값.
    exam1stProblems: problems,
    // 운영자가 cases.exam_1st_years 컬럼에 수동 입력한 연도 중 link 파생에 없는 것.
    exam1stExtraYears: extraYears.sort((a, b) => a - b),
    exam2ndYears: row.exam_2nd_years ?? [],
    primaryNodeId: row.primary_node_id ?? null,
  };
}

function parseSummaryItems(raw: unknown): SummaryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.body !== "string") continue;
    const comment =
      typeof o.commentMd === "string"
        ? o.commentMd
        : typeof o.comment_md === "string"
          ? (o.comment_md as string)
          : undefined;
    out.push({
      title: o.title,
      body: o.body,
      ...(comment !== undefined && comment !== "" ? { commentMd: comment } : {}),
    });
  }
  return out;
}

// parseCaseImages 는 labels.ts (클라이언트 안전) 에 단일 정의. 여기서는 import 만.

export interface RecentCasesFilters {
  // 특정 과목만 (cases.subject_laws contains).
  subject?: LawSubjectSlug;
  // 중요도 임계값 (importance >= minImportance).
  minImportance?: number;
}

// 최근 판례 (대시보드 위젯 + /latest/cases). decided_at 내림차순.
export async function listRecentCases(
  client: SupabaseClient<Database>,
  limit = 5,
  filters: RecentCasesFilters = {},
): Promise<CaseListItem[]> {
  let q = client.from("cases").select(LIST_COLUMNS).is("deleted_at", null);
  if (filters.subject) q = q.contains("subject_laws", [filters.subject]);
  if (filters.minImportance != null)
    q = q.gte("importance", filters.minImportance);
  const { data, error } = await q
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => rowToListItem(r as CaseListRow));
}

// source_asc — "원본 자료 순서". DB 에 source seq 컬럼이 따로 없어 created_at(import 시점)
// 오름차순으로 대체. 같은 systematic node 안에서는 시드 시점의 source 순서가 대체로 보존됨.
export type CaseSubjectSort =
  | "overall_asc" // 체계도 전체 순번(노드 트리 순) — 학습과목 기본
  | "overall_desc"
  | "decided_desc"
  | "decided_asc"
  | "case_no"
  | "case_no_desc"
  | "source_asc"
  // 컬럼 헤더 클릭 정렬(문제 탭과 동일 UX) — 중요도·법원·사건유형·전합.
  | "importance_desc"
  | "importance_asc"
  | "court_asc"
  | "court_desc"
  | "type_asc"
  | "type_desc"
  | "enbanc_desc"
  | "enbanc_asc"
  // 주제(주제N 노드) 정렬 — 쿼리는 기본 정렬로 두고 로더가 in-memory 재정렬(overall 과 동일 패턴).
  | "topic_asc"
  | "topic_desc";
export type CaseExamFilter = "any" | "exam_1st" | "exam_2nd" | "exam_both";
export type CaseCourtFilter = "all" | CaseCourt;

export interface ListCasesBySubjectOptions {
  query?: string;
  sort?: CaseSubjectSort;
  court?: CaseCourtFilter;
  examFilter?: CaseExamFilter; // 기출 유형
  // 판례 트리 필터 — 활성 시 이 case_id 들로만 제한. 빈 배열은 결과 0건.
  // undefined 또는 null = 트리 필터 비활성.
  filterCaseIds?: readonly string[] | null;
  // 강사 체크 중요도 최소값 (importance >= N). undefined/0 = 비활성.
  importanceMin?: number;
}

// 과목 판례 목록 — 페이지네이션 없이 전체 반환. total 은 KPI 표시용 카운트.
export interface CaseListPage {
  items: CaseListItem[];
  total: number;
}

// 과목 판례를 한 번에 가져오는 안전 상한 행수 (페이지네이션 제거 — feat-4-A-208).
// 초과 시 list 는 상한까지만, total(count)은 실제 건수라 누락이 드러난다.
const CASE_LIST_MAX = 2000;

export async function listCasesBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  options: ListCasesBySubjectOptions = {},
): Promise<CaseListPage> {
  const examProblemsByCase = await getExamProblemsByCase(client);

  // case_id 제한 — 트리 필터, 그리고 exam_1st/exam_both 면 기출-연결 판례로 한정.
  let restrictIds: string[] | null = options.filterCaseIds
    ? [...options.filterCaseIds]
    : null;
  if (options.examFilter === "exam_1st" || options.examFilter === "exam_both") {
    restrictIds =
      restrictIds === null
        ? [...examProblemsByCase.keys()]
        : restrictIds.filter((id) => examProblemsByCase.has(id));
  }
  if (restrictIds !== null && restrictIds.length === 0) {
    return { items: [], total: 0 };
  }

  // 필터·정렬이 적용된 빌더 — 페이지마다 새로 생성(빌더 재사용 금지). ★ case_id 를
  //   마지막 정렬 키로 붙여(비유일 정렬에도) 페이지 경계가 흔들리지 않게 한다.
  const buildQuery = () => {
    let q = client
      .from("cases")
      .select(LIST_COLUMNS, { count: "exact" })
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null);

    if (restrictIds !== null) {
      q = q.in("case_id", restrictIds);
    }

    const trimmed = options.query?.trim();
    if (trimmed) {
      // pg_trgm + ilike 다중 컬럼 — 사건번호·사건명·닉네임·유형·요지·판시이유·코멘트 본문.
      const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
      const pattern = `%${escaped}%`;
      q = q.or(
        `case_number.ilike.${pattern},case_title.ilike.${pattern},nickname.ilike.${pattern},case_type.ilike.${pattern},summary_title.ilike.${pattern},summary_body_md.ilike.${pattern},reasoning_md.ilike.${pattern},comment_body_md.ilike.${pattern}`,
      );
    }
    if (options.court && options.court !== "all") {
      q = q.eq("court", options.court);
    }
    if (options.importanceMin && options.importanceMin > 0) {
      q = q.gte("importance", options.importanceMin);
    }
    // 1차 기출(exam_1st/exam_both)은 위 restrictIds 로 이미 한정됨.
    // 2차 기출은 종전대로 exam_2nd_years 컬럼 기반.
    if (
      options.examFilter === "exam_2nd" ||
      options.examFilter === "exam_both"
    ) {
      q = q.not("exam_2nd_years", "eq", "{}");
    }

    switch (options.sort ?? "decided_desc") {
      case "decided_asc":
        q = q.order("decided_at", { ascending: true });
        break;
      case "case_no":
        q = q.order("case_number", { ascending: true });
        break;
      case "case_no_desc":
        q = q.order("case_number", { ascending: false });
        break;
      case "source_asc":
        // 원본 자료 순서 — cases.source_seq (precedents.json seqInSection 백필).
        q = q
          .order("source_seq", { ascending: true, nullsFirst: false })
          .order("case_number", { ascending: true });
        break;
      // 컬럼 헤더 정렬 — 동률은 선고일 최신순으로 2차 정렬(안정성은 아래 case_id 가 보장).
      case "importance_desc":
        q = q
          .order("importance", { ascending: false })
          .order("decided_at", { ascending: false });
        break;
      case "importance_asc":
        q = q
          .order("importance", { ascending: true })
          .order("decided_at", { ascending: false });
        break;
      case "court_asc":
        q = q
          .order("court", { ascending: true })
          .order("decided_at", { ascending: false });
        break;
      case "court_desc":
        q = q
          .order("court", { ascending: false })
          .order("decided_at", { ascending: false });
        break;
      case "type_asc":
        q = q
          .order("case_type", { ascending: true, nullsFirst: false })
          .order("decided_at", { ascending: false });
        break;
      case "type_desc":
        q = q
          .order("case_type", { ascending: false, nullsFirst: false })
          .order("decided_at", { ascending: false });
        break;
      case "enbanc_desc":
        q = q
          .order("is_en_banc", { ascending: false })
          .order("decided_at", { ascending: false });
        break;
      case "enbanc_asc":
        q = q
          .order("is_en_banc", { ascending: true })
          .order("decided_at", { ascending: false });
        break;
      default:
        q = q.order("decided_at", { ascending: false });
    }
    return q.order("case_id", { ascending: true });
  };

  // PostgREST max-rows=1000 — CASE_LIST_MAX 까지 페이지로 수집(단일 range 는 1000 에서
  //   잘려, 과목 판례가 1000 넘으면 조용히 누락되던 잠재 버그).
  const PAGE = 1000;
  const rows: NonNullable<Awaited<ReturnType<typeof buildQuery>>["data"]> = [];
  let total = 0;
  for (let offset = 0; offset < CASE_LIST_MAX; offset += PAGE) {
    const to = Math.min(offset + PAGE, CASE_LIST_MAX) - 1;
    const { data, error, count } = await buildQuery().range(offset, to);
    if (error) throw error;
    if (count != null) total = count;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < to - offset + 1) break;
  }
  return {
    items: rows.map((r) => rowToListItem(r as CaseListRow, examProblemsByCase)),
    total,
  };
}

// 조문별 case 개수 — 판례 트리 진입 (feat-4-A-210) 의 leaf 카운트.
// article_case_links 의 article_id 별 distinct case 개수. 같은 case 가 같은 article 에
// 여러 relation_type 으로 들어있어도 1개로 카운트한다.
export async function getCaseCountsByArticle(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<Record<string, number>> {
  const PAGE = 1000;
  const seenPair = new Set<string>(); // `${articleId}::${caseId}` — 중복 relation_type 제거.
  const counts: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("article_case_links")
      .select(
        "article_id, case_id, articles!inner(law_id, deleted_at), cases!inner(deleted_at)",
      )
      .eq("articles.law_id", lawId)
      .is("articles.deleted_at", null)
      .is("cases.deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const key = `${r.article_id}::${r.case_id}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      counts[r.article_id] = (counts[r.article_id] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

// 트리 축별 case 카운트 — 정책 (사용자 결정):
//   • 체계도 axis (byNodeId): 한 case 는 단일 placement.
//     우선순위: primary_node_id > primary_article_id 의 article_systematic_links
//             > legacy(article_case_links 의 article_systematic_links). 중복 배치 불가.
//   • 조문 axis (byArticleId): article_case_links many-to-many. 한 case 가 N 개 조문에
//     연결되어 있으면 N 곳 모두 카운트 (중복 배치 허용).
// 부모 노드/장 카운트는 buildCaseTreeCounts 의 aggregate 에서 자손 union → size 로 계산.
export interface CasePlacementMaps {
  caseSetByArticleId: Record<string, string[]>;
  caseSetByNodeId: Record<string, string[]>;
}

export async function getCasePlacementMaps(
  client: SupabaseClient<Database>,
  lawCode: string,
  lawId: string,
): Promise<CasePlacementMaps> {
  // ★전 테이블 무제한 select 는 max-rows(1000)에서 잘린다(articles 전체 2400+, 링크 1759).
  //   과목 스코프로 좁혀 배치+페이지네이션 헬퍼로 전량 조회.
  const [caseRows, lawArticles] = await Promise.all([
    fetchAllPages(() =>
      client
        .from("cases")
        .select("case_id, primary_article_id, primary_node_id")
        .contains("subject_laws", [lawCode])
        .is("deleted_at", null)
        .order("case_id"),
    ),
    fetchAllPages(() =>
      client
        .from("articles")
        .select("article_id")
        .eq("law_id", lawId)
        .is("deleted_at", null)
        .order("article_id"),
    ),
  ]);
  // 과목 articles set — law 필터링용.
  const articleIdsInLaw = new Set<string>(lawArticles.map((a) => a.article_id));
  const lawArticleIds = [...articleIdsInLaw];

  const [aslRows, aclRows] = await Promise.all([
    fetchAllIn(lawArticleIds, (slice) =>
      client
        .from("article_systematic_links")
        .select("article_id, node_id")
        .in("article_id", slice)
        .order("article_id"),
    ),
    fetchAllIn(lawArticleIds, (slice) =>
      client
        .from("article_case_links")
        .select("article_id, case_id")
        .in("article_id", slice)
        .order("case_id"),
    ),
  ]);

  // article → systematic nodes map (과목 article 만).
  const nodesByArticle = new Map<string, Set<string>>();
  for (const r of aslRows) {
    const s = nodesByArticle.get(r.article_id) ?? new Set();
    s.add(r.node_id);
    nodesByArticle.set(r.article_id, s);
  }

  // 과목 case 들의 set + article_case_links 를 case 별로 grouping (과목 한정).
  const caseIdsInSubject = new Set(caseRows.map((c) => c.case_id));
  const aclByCase = new Map<string, Set<string>>();
  for (const r of aclRows) {
    if (!caseIdsInSubject.has(r.case_id)) continue;
    const s = aclByCase.get(r.case_id) ?? new Set();
    s.add(r.article_id);
    aclByCase.set(r.case_id, s);
  }

  const byArticle = new Map<string, Set<string>>();
  const byNode = new Map<string, Set<string>>();
  function addArticle(articleId: string, caseId: string) {
    let s = byArticle.get(articleId);
    if (!s) {
      s = new Set();
      byArticle.set(articleId, s);
    }
    s.add(caseId);
  }
  function addNode(nodeId: string, caseId: string) {
    let s = byNode.get(nodeId);
    if (!s) {
      s = new Set();
      byNode.set(nodeId, s);
    }
    s.add(caseId);
  }

  // 1) 체계도 axis — 단일 placement.
  for (const c of caseRows) {
    if (c.primary_node_id) {
      addNode(c.primary_node_id, c.case_id);
      continue;
    }
    if (c.primary_article_id) {
      for (const n of nodesByArticle.get(c.primary_article_id) ?? new Set()) {
        addNode(n, c.case_id);
      }
      continue;
    }
    // legacy — primary 미지정이면 ACL 의 article 들이 가리키는 nodes 모두.
    const articles = aclByCase.get(c.case_id) ?? new Set<string>();
    for (const a of articles) {
      for (const n of nodesByArticle.get(a) ?? new Set()) {
        addNode(n, c.case_id);
      }
    }
  }

  // 2) 조문 axis — article_case_links many-to-many (중복 배치 허용).
  //    primary_* 와 무관, ACL 만 본다. 한 case 가 article 1·2 에 연결되어 있으면
  //    조문 트리에서 article 1·2 양쪽 모두에 노출/카운트.
  for (const [caseId, articles] of aclByCase) {
    for (const a of articles) addArticle(a, caseId);
  }

  const caseSetByArticleId: Record<string, string[]> = {};
  for (const [k, v] of byArticle.entries()) caseSetByArticleId[k] = [...v];
  const caseSetByNodeId: Record<string, string[]> = {};
  for (const [k, v] of byNode.entries()) caseSetByNodeId[k] = [...v];
  return { caseSetByArticleId, caseSetByNodeId };
}

// 체계도 전체 순번(판례) — 과목 판례를 체계도 노드 트리 순(노드 내는 원본순 source_seq→사건번호)으로
// 줄 세워 caseId → 1..N 맵 반환. 노드 귀속 = caseSetByNodeId(getCasePlacementMaps, 다중 노드면
// 트리에서 가장 이른 노드). 배치가 바뀌면 매 호출 재계산되는 파생값(저장 안 함).
//   nodeOrder = systematic_nodes 를 path 순으로 정렬한 node_id 배열(트리 표시 순).
export async function computeCaseOverallOrder(
  client: SupabaseClient<Database>,
  lawCode: string,
  nodeOrder: readonly string[],
  caseSetByNodeId: Record<string, string[]>,
): Promise<Record<string, number>> {
  const nodeRank = new Map<string, number>();
  nodeOrder.forEach((id, i) => nodeRank.set(id, i));

  // case → 트리에서 가장 이른(rank 최소) 노드 rank.
  const caseMinRank = new Map<string, number>();
  for (const [nodeId, caseIds] of Object.entries(caseSetByNodeId)) {
    const rank = nodeRank.get(nodeId);
    if (rank === undefined) continue;
    for (const cid of caseIds) {
      const cur = caseMinRank.get(cid);
      if (cur === undefined || rank < cur) caseMinRank.set(cid, rank);
    }
  }

  // 노드 내 순서 키 = source_asc(원본 순서: source_seq nulls last → 사건번호). 미배치는 맨 뒤.
  // PostgREST max-rows=1000 — CASE_LIST_MAX 까지 페이지로 수집(단일 range 는 1000 캡).
  const CASE_PAGE = 1000;
  const caseRows: Array<{
    case_id: string;
    source_seq: number | null;
    case_number: string | null;
  }> = [];
  for (let offset = 0; offset < CASE_LIST_MAX; offset += CASE_PAGE) {
    const to = Math.min(offset + CASE_PAGE, CASE_LIST_MAX) - 1;
    const { data, error } = await client
      .from("cases")
      .select("case_id, source_seq, case_number")
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null)
      .order("case_id", { ascending: true })
      .range(offset, to);
    if (error) throw error;
    const batch = data ?? [];
    caseRows.push(...batch);
    if (batch.length < to - offset + 1) break;
  }
  const UNPLACED = nodeOrder.length;
  const ordered = (caseRows ?? [])
    .map((c) => ({
      caseId: c.case_id,
      rank: caseMinRank.get(c.case_id) ?? UNPLACED,
      seq: c.source_seq ?? Number.POSITIVE_INFINITY,
      num: c.case_number ?? "",
    }))
    .sort(
      (a, b) => a.rank - b.rank || a.seq - b.seq || a.num.localeCompare(b.num),
    );
  const map: Record<string, number> = {};
  ordered.forEach((x, i) => {
    map[x.caseId] = i + 1;
  });
  return map;
}

// 전체(체계도 전체 순번) 판례 이웃 목록 — 뷰어 prev/next 가 노드/조문 컨텍스트 없이
// 진입했을 때(전체 목록에서 판례 선택) "전체" 목록 순서로 이웃 이동하도록.
// computeCaseOverallOrder 와 동일 정렬 규칙(체계도 트리순 → 노드 내 source_asc → 사건번호)을
// 쓰되 CaseSibling[] 로 반환한다.
export async function getOverallOrderedCaseSiblings(
  client: SupabaseClient<Database>,
  lawCode: string,
  nodeOrder: readonly string[],
  caseSetByNodeId: Record<string, string[]>,
): Promise<CaseSibling[]> {
  const nodeRank = new Map<string, number>();
  nodeOrder.forEach((id, i) => nodeRank.set(id, i));
  const caseMinRank = new Map<string, number>();
  for (const [nodeId, caseIds] of Object.entries(caseSetByNodeId)) {
    const rank = nodeRank.get(nodeId);
    if (rank === undefined) continue;
    for (const cid of caseIds) {
      const cur = caseMinRank.get(cid);
      if (cur === undefined || rank < cur) caseMinRank.set(cid, rank);
    }
  }
  const CASE_PAGE = 1000;
  const rows: Array<{
    case_id: string;
    source_seq: number | null;
    case_number: string | null;
    case_title: string | null;
  }> = [];
  for (let offset = 0; offset < CASE_LIST_MAX; offset += CASE_PAGE) {
    const to = Math.min(offset + CASE_PAGE, CASE_LIST_MAX) - 1;
    const { data, error } = await client
      .from("cases")
      .select("case_id, source_seq, case_number, case_title")
      .contains("subject_laws", [lawCode])
      .is("deleted_at", null)
      .order("case_id", { ascending: true })
      .range(offset, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < to - offset + 1) break;
  }
  const UNPLACED = nodeOrder.length;
  const enriched = rows.map((c) => ({
    sib: {
      caseId: c.case_id,
      caseNumber: c.case_number ?? "",
      caseTitle: c.case_title ?? "",
      sourceSeq: c.source_seq,
    } as CaseSibling,
    rank: caseMinRank.get(c.case_id) ?? UNPLACED,
    seq: c.source_seq ?? Number.POSITIVE_INFINITY,
  }));
  enriched.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.seq - b.seq ||
      a.sib.caseNumber.localeCompare(b.sib.caseNumber),
  );
  return enriched.map((e) => e.sib);
}

// (deprecated) getCaseIdsByArticleIds — placement 모델로 전환되며 사용 안 함.
// 호출처 없음. getCaseIdsByPlacement(articleIds, nodeIds=[]) 가 동일 역할 + legacy fallback.

// 조문 axis 필터 — article_case_links many-to-many.
// 한 case 가 여러 article 에 연결되어 있으면 모든 article 위치에서 잡힌다(중복 배치).
// primary_* 는 보지 않는다. cases-tab 의 article/chapter 트리 필터 전용.
export async function getCaseIdsByArticleLinks(
  client: SupabaseClient<Database>,
  articleIds: readonly string[],
): Promise<string[]> {
  if (articleIds.length === 0) return [];
  const out = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const slice = articleIds.slice(i, i + CHUNK);
    const { data, error } = await client
      .from("article_case_links")
      .select("case_id, cases!inner(deleted_at)")
      .in("article_id", slice)
      .is("cases.deleted_at", null);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.case_id);
  }
  return [...out];
}

// 체계도 axis 필터 — cases.primary_node_id / primary_article_id 단일 placement.
//   1) primary_node_id IN target nodeIds → 그 case
//   2) primary_node_id IS NULL AND primary_article_id IN target articleIds → 그 case
//   3) primary_article_id IS NULL AND primary_node_id IS NULL AND
//      article_case_links.article_id IN target articleIds → legacy fallback case
// 합집합 distinct. articleIds 빈 배열이면 step 2/3 skip, nodeIds 빈 배열이면 step 1 skip.
export async function getCaseIdsByPlacement(
  client: SupabaseClient<Database>,
  articleIds: readonly string[],
  nodeIds: readonly string[],
): Promise<string[]> {
  const out = new Set<string>();
  const CHUNK = 200;
  const PAGE = 1000;

  // step 1) primary_node_id 직접 매핑
  if (nodeIds.length > 0) {
    for (let i = 0; i < nodeIds.length; i += CHUNK) {
      const slice = nodeIds.slice(i, i + CHUNK);
      const { data, error } = await client
        .from("cases")
        .select("case_id")
        .in("primary_node_id", slice)
        .is("deleted_at", null);
      if (error) throw error;
      for (const r of data ?? []) out.add(r.case_id);
    }
  }

  if (articleIds.length > 0) {
    // step 2) primary_article_id 가 target 에 속하고 primary_node_id 가 null
    for (let i = 0; i < articleIds.length; i += CHUNK) {
      const slice = articleIds.slice(i, i + CHUNK);
      const { data, error } = await client
        .from("cases")
        .select("case_id")
        .in("primary_article_id", slice)
        .is("primary_node_id", null)
        .is("deleted_at", null);
      if (error) throw error;
      for (const r of data ?? []) out.add(r.case_id);
    }

    // step 3) legacy fallback — primary 둘 다 null 인 case 중 article_case_links 매핑.
    // candidate case_id 모음 + cases.primary 둘 다 null 필터.
    const candidates = new Set<string>();
    for (let i = 0; i < articleIds.length; i += CHUNK) {
      const slice = articleIds.slice(i, i + CHUNK);
      const { data, error } = await client
        .from("article_case_links")
        .select("case_id")
        .in("article_id", slice);
      if (error) throw error;
      for (const r of data ?? []) candidates.add(r.case_id);
    }
    if (candidates.size > 0) {
      const arr = [...candidates];
      for (let i = 0; i < arr.length; i += CHUNK) {
        const slice = arr.slice(i, i + CHUNK);
        const { data, error } = await client
          .from("cases")
          .select("case_id")
          .in("case_id", slice)
          .is("primary_article_id", null)
          .is("primary_node_id", null)
          .is("deleted_at", null);
        if (error) throw error;
        for (const r of data ?? []) out.add(r.case_id);
      }
    }
  }

  return [...out];
}

// feat-4-A-214 관련논문/기사 링크.
// case 한 건에 연결된 외부 자료 (논문/기사/기타). 읽기는 공개, 쓰기는 staff.
// 타입은 ./labels 에 정의 — 클라이언트 번들 안전 import.

export async function listCaseReferences(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseReference[]> {
  const { data, error } = await client
    .from("case_references")
    .select(
      "reference_id, case_id, kind, title, authors, source, published_at, url, pdf_url, note, ord, created_at, updated_at",
    )
    .eq("case_id", caseId)
    .order("ord", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    referenceId: r.reference_id,
    caseId: r.case_id,
    kind: r.kind as CaseReferenceKind,
    title: r.title,
    authors: r.authors,
    source: r.source,
    publishedAt: r.published_at,
    url: r.url,
    pdfUrl: r.pdf_url,
    note: r.note,
    ord: r.ord,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface UpsertCaseReferenceInput {
  caseId: string;
  kind: CaseReferenceKind;
  title: string;
  authors?: string | null;
  source?: string | null;
  publishedAt?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  note?: string | null;
  ord?: number;
}

export async function createCaseReference(
  client: SupabaseClient<Database>,
  input: UpsertCaseReferenceInput,
  authorId: string,
): Promise<{ ok: true; referenceId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("case_references")
    .insert({
      case_id: input.caseId,
      kind: input.kind,
      title: input.title,
      authors: input.authors ?? null,
      source: input.source ?? null,
      published_at: input.publishedAt ?? null,
      url: input.url ?? null,
      pdf_url: input.pdfUrl ?? null,
      note: input.note ?? null,
      ord: input.ord ?? 0,
      created_by: authorId,
    })
    .select("reference_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, referenceId: data.reference_id };
}

export async function updateCaseReference(
  client: SupabaseClient<Database>,
  referenceId: string,
  patch: Partial<Omit<UpsertCaseReferenceInput, "caseId">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.authors !== undefined) update.authors = patch.authors;
  if (patch.source !== undefined) update.source = patch.source;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.pdfUrl !== undefined) update.pdf_url = patch.pdfUrl;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.ord !== undefined) update.ord = patch.ord;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("case_references")
    .update(update)
    .eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCaseReference(
  client: SupabaseClient<Database>,
  referenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("case_references")
    .delete()
    .eq("reference_id", referenceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 한 case 의 placement 형제 — 같은 primary_node_id (또는 primary_node_id 가 null 이면
// 같은 primary_article_id) 의 case 들을 source_seq 정렬로 반환.
// admin-case-edit 의 순서 조정 UI 가 사용.
export interface CaseSibling {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  sourceSeq: number | null;
}

export async function getCaseSiblings(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<{ kind: "node" | "article"; placementId: string; siblings: CaseSibling[] } | null> {
  const { data: me, error: meErr } = await client
    .from("cases")
    .select("primary_node_id, primary_article_id")
    .eq("case_id", caseId)
    .maybeSingle();
  if (meErr) throw meErr;
  if (!me) return null;

  // 1순위: primary placement (node 우선, 그 다음 article)
  const useNode = me.primary_node_id !== null;
  const placementId = me.primary_node_id ?? me.primary_article_id;

  if (placementId) {
    let q = client
      .from("cases")
      .select("case_id, case_number, case_title, source_seq")
      .is("deleted_at", null);
    q = useNode
      ? q.eq("primary_node_id", placementId)
      : q.eq("primary_article_id", placementId).is("primary_node_id", null);

    const { data, error } = await q
      .order("source_seq", { ascending: true, nullsFirst: false })
      .order("case_number", { ascending: true });
    if (error) throw error;
    return {
      kind: useNode ? "node" : "article",
      placementId,
      siblings: (data ?? []).map((r) => ({
        caseId: r.case_id,
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        sourceSeq: r.source_seq,
      })),
    };
  }

  // primary placement 가 없는 case 는 null. URL 컨텍스트(case_node/case_article) 기반
  // fallback 은 case-viewer 가 직접 처리 (목록 화면의 트리 chip 과 정합 보장).
  return null;
}

// case_id 셋으로 cases 정보 조회 → CaseSibling[]. case-viewer 의 prev/next 가
// URL 컨텍스트(case_node subtree, case_article ACL) 로 미리 계산한 case id 셋을
// 그대로 형제로 노출하는 데 사용. 정렬: source_seq asc nullsLast → decided_desc → case_number.
// (체계도 axis 기본 정렬: source_asc nullsLast. article axis: decided_desc. 두 컨텍스트
// 모두에 무난한 통합 정렬 적용.)
export async function getCasesByIds(
  client: SupabaseClient<Database>,
  caseIds: readonly string[],
): Promise<CaseSibling[]> {
  if (caseIds.length === 0) return [];
  const { data, error } = await client
    .from("cases")
    .select("case_id, case_number, case_title, source_seq, decided_at")
    .in("case_id", caseIds as string[])
    .is("deleted_at", null);
  if (error) throw error;
  const rows = data ?? [];
  rows.sort((a, b) => {
    // source_seq 부여된 항목 우선(asc), 없는 항목은 뒤로.
    const sa = a.source_seq;
    const sb = b.source_seq;
    if (sa != null && sb != null) {
      if (sa !== sb) return sa - sb;
    } else if (sa != null) {
      return -1;
    } else if (sb != null) {
      return 1;
    }
    // tiebreaker: decided_at desc
    const da = a.decided_at ?? "";
    const db = b.decided_at ?? "";
    if (da !== db) return da < db ? 1 : -1;
    return (a.case_number ?? "").localeCompare(b.case_number ?? "");
  });
  return rows.map((r) => ({
    caseId: r.case_id,
    caseNumber: r.case_number,
    caseTitle: r.case_title,
    sourceSeq: r.source_seq,
  }));
}

export async function getCaseById(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<CaseDetail | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, subject_laws, exam_1st_years, exam_2nd_years, summary_body_md, summary_items, reasoning_md, full_text_pdf, comment_source, comment_body_md, comment_label, related_md, images, primary_article_id, primary_node_id, official_text_pdf_path, book_sections",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...rowToListItem(data as CaseListRow),
    summaryBodyMd: data.summary_body_md,
    summaryItems: parseSummaryItems(data.summary_items),
    reasoningMd: data.reasoning_md,
    fullTextPdf: data.full_text_pdf,
    commentSource: data.comment_source,
    commentBodyMd: data.comment_body_md,
    commentLabel: (CASE_COMMENT_LABEL_VALUES as readonly string[]).includes(
      data.comment_label,
    )
      ? (data.comment_label as CaseCommentLabel)
      : "remark",
    relatedMd: data.related_md,
    images: parseCaseImages(data.images),
    primaryArticleId: data.primary_article_id,
    primaryNodeId: data.primary_node_id,
    officialTextPdfPath: data.official_text_pdf_path,
    bookSections: parseBookSections(data.book_sections),
  };
}

// soft-deleted case 에 진입한 경우 — 같은 사건번호로 재등록된 활성 row 가 있으면
// 그 case_id 를 반환해 case-viewer 가 redirect 할 수 있게 한다.
// 활성 row 가 없으면 deleted case 자체의 정보를 반환 (친절 404 안내용).
export async function findActiveCaseByDeletedId(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<{
  replacementCaseId: string | null;
  deletedCaseNumber: string | null;
}> {
  const { data: deletedRow } = await client
    .from("cases")
    .select("case_number, deleted_at")
    .eq("case_id", caseId)
    .maybeSingle();
  if (!deletedRow || !deletedRow.deleted_at) {
    // case 가 아예 없거나(잘못된 UUID) deleted 가 아님(다른 원인 — 권한 등) → fallback 없음.
    return {
      replacementCaseId: null,
      deletedCaseNumber: deletedRow?.case_number ?? null,
    };
  }
  // 사건번호는 법률 단위 유일 — 특허·상표 양쪽 판례집에 수록된 판례는 활성 행이 2개일 수 있다.
  const { data: activeRows } = await client
    .from("cases")
    .select("case_id")
    .eq("case_number", deletedRow.case_number)
    .is("deleted_at", null)
    .limit(1);
  return {
    replacementCaseId: activeRows?.[0]?.case_id ?? null,
    deletedCaseNumber: deletedRow.case_number,
  };
}

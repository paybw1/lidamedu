import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  CASE_COMMENT_LABEL_VALUES,
  parseBookSections,
  parseCaseImages,
  parseRelatedCases,
  type CaseCommentLabel,
  type CaseCourt,
  type CaseDetail,
  type CasePlacement,
  type CaseListItem,
  type CaseReference,
  type CaseReferenceKind,
  type SummaryItem,
} from "./labels";

import { fetchAllIn, fetchAllPages } from "~/core/lib/supa-batch.server";
import type { ExamProblemRef } from "~/features/problems/labels";
import {
  extractAnswerCaseNums,
  getExamProblemsByCase,
} from "~/features/problems/queries.server";
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
    // ★NULL 은 NULL 로 둔다 — 중요도 미부여(민법 1문항 인용 886건)를 1성으로
    //   보이게 하면 원장이 매긴 중요도 1 과 구분이 안 된다(2026-08-20).
    importance: row.importance,
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
  let q = client
    .from("cases")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .eq("list_visible", true);
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
  // 목록 미수록(list_visible=false) 판례까지 포함. 관리 화면 전용.
  includeUnlisted?: boolean;
}

// 과목 판례 목록 — 페이지네이션 없이 전체 반환. total 은 KPI 표시용 카운트.
export interface CaseListPage {
  items: CaseListItem[];
  total: number;
}

// 과목 판례를 한 번에 가져오는 안전 상한 행수 (페이지네이션 제거 — feat-4-A-208).
// 초과 시 list 는 상한까지만, total(count)은 실제 건수라 누락이 드러난다.
const CASE_LIST_MAX = 2000;

// 2차 주관식 기출 참조 — 사건번호별 {인용·메인 지정한 문제들}. 모범답안 인용
// (extractAnswerCaseNums — 문제 뷰어 관련판례 배지와 동일 규칙) + main_case_number 파생.
// 판례 목록·뷰어의 "2차 y" 칩(미리보기 팝업)과 메인 ★ 강조의 데이터원.
interface Subjective2ndRef {
  problemId: string;
  lawCode: string;
  year: number;
  problemNumber: number | null;
  isMain: boolean;
}
async function getSubjective2ndRefs(
  client: SupabaseClient<Database>,
  lawCodes: string[],
): Promise<Array<{ num: string; refs: Subjective2ndRef[] }>> {
  if (lawCodes.length === 0) return [];
  const { data } = await client
    .from("problems")
    .select(
      "problem_id, year, problem_number, main_case_number, model_answer_md, laws!inner(law_code)",
    )
    .in("laws.law_code", lawCodes)
    .eq("format", "subjective")
    .is("deleted_at", null)
    .not("year", "is", null);
  const byNum = new Map<string, Map<string, Subjective2ndRef>>();
  for (const r of data ?? []) {
    const mains = (r.main_case_number ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cites = extractAnswerCaseNums(r.model_answer_md ?? "");
    for (const num of new Set([...cites, ...mains])) {
      const refs = byNum.get(num) ?? new Map<string, Subjective2ndRef>();
      refs.set(r.problem_id, {
        problemId: r.problem_id,
        lawCode: r.laws.law_code,
        year: r.year!,
        problemNumber: r.problem_number,
        isMain: mains.includes(num),
      });
      byNum.set(num, refs);
    }
  }
  return [...byNum].map(([num, refs]) => ({ num, refs: [...refs.values()] }));
}

// 사건번호(병합 표기 포함) 매칭으로 판례 항목에 2차 기출 참조·메인 연도를 부착.
function attach2ndRefs(
  item: CaseListItem,
  refsByNum: Array<{ num: string; refs: Subjective2ndRef[] }>,
): void {
  const matched = refsByNum
    .filter((m) => item.caseNumber === m.num || item.caseNumber.includes(m.num))
    .flatMap((m) => m.refs);
  if (matched.length === 0) return;
  // 같은 문제가 여러 번호로 매칭돼도 1회.
  const byProblem = new Map(matched.map((r) => [r.problemId, r]));
  // isMain 은 어느 번호로든 메인이면 true 로 승격.
  for (const r of matched) {
    if (r.isMain) byProblem.get(r.problemId)!.isMain = true;
  }
  item.exam2ndProblems = [...byProblem.values()].sort(
    (a, b) => a.year - b.year || (a.problemNumber ?? 0) - (b.problemNumber ?? 0),
  );
  const mainYears = [
    ...new Set(
      item.exam2ndProblems.filter((r) => r.isMain).map((r) => r.year),
    ),
  ].sort((a, b) => a - b);
  if (mainYears.length > 0) item.exam2ndMainYears = mainYears;
}

/**
 * 판례 id 집합을 목록 필터(법원·기출)로 좁힌다 — **prev/next 가 목록과 같은 범위를 돌게** 하는 용도.
 *
 * ★판정 규칙은 `listCasesBySubject` 와 같아야 한다(두 곳이 갈리면 목록과 이웃이 어긋난다):
 *   · 검색어    = 사건번호·사건명·닉네임·유형·요지·판시이유·코멘트 다중 ilike (아래 CASE_SEARCH_COLUMNS)
 *   · 법원      = cases.court 일치
 *   · 중요도    = importance >= N
 *   · 1차 기출  = 기출 문제가 연결된 판례(getExamProblemsByCase)
 *   · 2차 기출  = exam_2nd_years 가 비어 있지 않음
 *   · 1·2차 모두 = 위 둘을 모두 만족
 * (즐겨찾기는 사용자 축이라 호출부가 id 집합으로 걸러 넘긴다)
 * ★id 를 통째로 .in() 에 넣으면 URL 이 길어져 PostgREST 가 400 을 던진다 — fetchAllIn 으로 조각낸다.
 */
/**
 * 판례 검색 OR 조건식 — 목록 쿼리와 prev/next 범위 계산이 **같은 식**을 써야 한다.
 * pg_trgm + ilike 다중 컬럼: 사건번호·사건명·닉네임·유형·요지·판시이유·코멘트 본문.
 * ★%와 , 는 PostgREST or() 문법을 깨뜨리므로 미리 걷어낸다.
 */
function caseSearchOrExpr(query: string): string {
  const escaped = query.trim().replaceAll("%", "").replaceAll(",", " ");
  const p = `%${escaped}%`;
  return [
    `case_number.ilike.${p}`,
    `case_title.ilike.${p}`,
    `nickname.ilike.${p}`,
    `case_type.ilike.${p}`,
    `summary_title.ilike.${p}`,
    `summary_body_md.ilike.${p}`,
    `reasoning_md.ilike.${p}`,
    `comment_body_md.ilike.${p}`,
  ].join(",");
}

export async function narrowCaseIdsByFilters(
  client: SupabaseClient<Database>,
  caseIds: string[],
  opts: {
    court?: CaseCourtFilter;
    exam?: CaseExamFilter;
    query?: string;
    importanceMin?: number;
  },
): Promise<Set<string>> {
  const court = opts.court && opts.court !== "all" ? opts.court : null;
  const exam = opts.exam && opts.exam !== "any" ? opts.exam : null;
  const query = opts.query?.trim() || null;
  const importanceMin =
    opts.importanceMin && opts.importanceMin > 0 ? opts.importanceMin : null;
  if (caseIds.length === 0 || (!court && !exam && !query && !importanceMin)) {
    return new Set(caseIds);
  }

  const needs1st = exam === "exam_1st" || exam === "exam_both";
  const needs2nd = exam === "exam_2nd" || exam === "exam_both";

  const [rows, examProblemsByCase] = await Promise.all([
    fetchAllIn<{ case_id: string; court: string; exam_2nd_years: number[] | null }>(
      caseIds,
      (slice) => {
        let q = client
          .from("cases")
          .select("case_id, court, exam_2nd_years")
          .in("case_id", slice);
        // 검색·중요도는 DB 에서 건다 — 본문 컬럼(reasoning_md 등)을 다 실어 오지 않으려면
        // 여기서 걸러야 한다(목록 쿼리와 같은 조건식).
        if (query) q = q.or(caseSearchOrExpr(query));
        if (importanceMin) q = q.gte("importance", importanceMin);
        return q.order("case_id");
      },
    ),
    needs1st
      ? getExamProblemsByCase(client)
      : Promise.resolve(new Map<string, unknown>()),
  ]);

  const out = new Set<string>();
  for (const r of rows) {
    if (court && r.court !== court) continue;
    if (needs1st && !examProblemsByCase.has(r.case_id)) continue;
    if (needs2nd && (r.exam_2nd_years ?? []).length === 0) continue;
    out.add(r.case_id);
  }
  return out;
}

export async function listCasesBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  options: ListCasesBySubjectOptions = {},
): Promise<CaseListPage> {
  const [examProblemsByCase, subjective2ndRefs] = await Promise.all([
    getExamProblemsByCase(client),
    getSubjective2ndRefs(client, [lawCode]),
  ]);

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

    // ★목록 노출 플래그 — 접근 차단이 아니라 목록·카운트에서만 뺀다(상세·팝업은 열린다).
    if (!options.includeUnlisted) q = q.eq("list_visible", true);

    if (restrictIds !== null) {
      q = q.in("case_id", restrictIds);
    }

    const trimmed = options.query?.trim();
    if (trimmed) {
      q = q.or(caseSearchOrExpr(trimmed));
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
  const items = rows.map((r) => {
    const item = rowToListItem(r as CaseListRow, examProblemsByCase);
    attach2ndRefs(item, subjective2ndRefs);
    return item;
  });
  return { items, total };
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
        "article_id, case_id, articles!inner(law_id, deleted_at), cases!inner(deleted_at, list_visible)",
      )
      .eq("articles.law_id", lawId)
      .is("articles.deleted_at", null)
      .is("cases.deleted_at", null)
      .eq("cases.list_visible", true)
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
        .eq("list_visible", true)
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

  // feat-3-214 — 판례 다중 배치 링크. 있으면 이게 체계도 배치의 권위다.
  const cslRows = await fetchAllIn<{ case_id: string; node_id: string }>(
    [...caseIdsInSubject],
    (slice) =>
      client
        .from("case_systematic_links")
        .select("case_id, node_id")
        .in("case_id", slice)
        .order("case_id"),
  );
  const nodesByCase = new Map<string, Set<string>>();
  for (const r of cslRows) {
    const s = nodesByCase.get(r.case_id) ?? new Set<string>();
    s.add(r.node_id);
    nodesByCase.set(r.case_id, s);
  }
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

  // 1) 체계도 axis — feat-3-214 다중 배치.
  //    ★교재가 같은 판결을 두 주제에서 다른 각도로 다루면 양쪽에 센다(그 주제에서 읽을
  //      내용이 실제로 따로 있다). 과목 총계는 상위에서 distinct 로 집계하므로 부풀지 않는다.
  for (const c of caseRows) {
    const linked = nodesByCase.get(c.case_id);
    if (linked && linked.size > 0) {
      for (const n of linked) addNode(n, c.case_id);
      continue;
    }
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
  // ★id 를 통째로 .in() 에 넣으면 URL 이 길어져 PostgREST 가 400 을 던진다.
  const chunked = (arr: readonly string[], size: number): string[][] => {
    const res: string[][] = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  // step 1) 체계도 배치 — feat-3-214 다중 배치 링크 union.
  //   ★링크가 권위다. 링크 없는 판례(적재 전·타 과목)만 primary_node_id 로 폴백.
  if (nodeIds.length > 0) {
    const linkedCaseIds = new Set<string>();
    for (let i = 0; i < nodeIds.length; i += CHUNK) {
      const slice = nodeIds.slice(i, i + CHUNK);
      const { data, error } = await client
        .from("case_systematic_links")
        .select("case_id")
        .in("node_id", slice);
      if (error) throw error;
      for (const r of data ?? []) linkedCaseIds.add(r.case_id);
    }
    // 링크가 가리키는 판례 중 살아 있고 목록 노출인 것만.
    for (const chunk of chunked([...linkedCaseIds], CHUNK)) {
      const { data, error } = await client
        .from("cases")
        .select("case_id")
        .in("case_id", chunk)
        .is("deleted_at", null)
        .eq("list_visible", true);
      if (error) throw error;
      for (const r of data ?? []) out.add(r.case_id);
    }
    // 폴백 — 링크가 아직 없는 판례.
    for (let i = 0; i < nodeIds.length; i += CHUNK) {
      const slice = nodeIds.slice(i, i + CHUNK);
      const { data, error } = await client
        .from("cases")
        .select("case_id")
        .in("primary_node_id", slice)
        .is("deleted_at", null)
        .eq("list_visible", true);
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
        .is("deleted_at", null)
        .eq("list_visible", true);
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
          .is("deleted_at", null)
          .eq("list_visible", true);
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
  /**
   * feat-3-214 — 어느 주제에서 들어왔는지. 교재가 같은 판결을 두 주제에서 다른 각도로
   * 다루면 그 주제의 서술을 보여 준다. 없거나 못 찾으면 대표 배치 본문.
   */
  nodeId?: string | null,
): Promise<CaseDetail | null> {
  const { data, error } = await client
    .from("cases")
    .select(
      "case_id, court, decided_at, case_number, case_title, nickname, case_type, is_en_banc, importance, summary_title, subject_laws, exam_1st_years, exam_2nd_years, summary_body_md, summary_items, reasoning_md, full_text_pdf, comment_source, comment_body_md, comment_label, related_md, related_cases, images, primary_article_id, primary_node_id, official_text_pdf_path, book_sections",
    )
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // 2차 주관식 기출 칩(미리보기)·메인 ★ 강조 — 이 판례의 과목 주관식 인용·메인 파생.
  const refsByNum = await getSubjective2ndRefs(client, data.subject_laws ?? []);

  // feat-3-214 — 교재에서 이 판례를 다루는 자리들 + 지금 볼 자리의 서술.
  const { data: linkRows, error: linkErr } = await client
    .from("case_systematic_links")
    .select("node_id, is_primary, seq, book_sections, systematic_nodes(display_label)")
    .eq("case_id", caseId)
    .order("seq");
  if (linkErr) throw linkErr;
  const placements: CasePlacement[] = (linkRows ?? []).map((l) => ({
    nodeId: l.node_id,
    label:
      (l.systematic_nodes as { display_label: string } | null)?.display_label ?? "배치",
    isPrimary: l.is_primary,
    hasOwnBody: l.book_sections != null,
  }));
  const active =
    (nodeId ? (linkRows ?? []).find((l) => l.node_id === nodeId) : null) ??
    (linkRows ?? []).find((l) => l.is_primary) ??
    null;
  // 그 자리에 서술이 따로 있으면 그것을, 없으면 판례 본문(cases.book_sections).
  const activeBook =
    active?.book_sections != null ? active.book_sections : data.book_sections;

  const detail: CaseDetail = {
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
    relatedCases: parseRelatedCases(data.related_cases),
    images: parseCaseImages(data.images),
    primaryArticleId: data.primary_article_id,
    primaryNodeId: data.primary_node_id,
    officialTextPdfPath: data.official_text_pdf_path,
    bookSections: parseBookSections(activeBook),
    placements,
    activeNodeId: active?.node_id ?? data.primary_node_id ?? null,
  };
  attach2ndRefs(detail, refsByNum);
  return detail;
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

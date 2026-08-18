import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  ExamCaseLink,
  ExamCaseLinkRow,
  ExamCaseSegment,
  ExamProblemRef,
  ProblemDetail,
  ProblemExamRound,
  ProblemFormat,
  ProblemListItem,
  ProblemOrigin,
  ProblemPolarity,
  ProblemScope,
} from "./labels";

import adminClient from "~/core/lib/supa-admin-client.server";
import { fetchAllIn, fetchAllPages } from "~/core/lib/supa-batch.server";
import { getBookmarksByTargets } from "~/features/annotations/queries.server";
import { listCommentsBulk } from "~/features/comments/queries.server";
import { articleSlug } from "~/features/laws/lib/identifier";
import { sortSystematicTreeOrder } from "~/features/laws/lib/systematic-order";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import {
  type AnswerCaseGroup,
  type AnswerCitedCase,
  type ChoiceCaseRef,
  MC_FORMATS,
  type OxQuestionItem,
  type OxRefAnnotations,
  type OxTruth,
  parseRubricItems,
} from "./labels";
import { dedupeOxByBody } from "~/features/problems/lib/ox-dedup";

export type {
  ProblemExamRound,
  ProblemFormat,
  ProblemOrigin,
  ProblemPolarity,
  ProblemScope,
  ProblemChoiceType,
  ProblemListItem,
  ProblemChoice,
  ProblemDetail,
  ExamProblemRef,
  OxTruth,
  OxQuestionItem,
  OxRefAnnotations,
} from "./labels";
export {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  ORIGIN_HAS_ROUND,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
} from "./labels";

export interface ListProblemsFilters {
  origin?: ProblemOrigin;
  // 여러 출처를 한 묶음으로 조회(.in) — 학습과목 문제탭 "기출"=기출+기출변형 그룹.
  //   설정 시 origin(.eq) 보다 우선. admin·맞춤퀴즈는 origin(exact) 그대로 사용.
  origins?: ProblemOrigin[];
  format?: ProblemFormat;
  polarity?: ProblemPolarity;
  scope?: ProblemScope;
  examRound?: ProblemExamRound;
  year?: number;
  // 본문 ILIKE 부분문자열 검색 (Korean/한자 혼재 → FTS 대신 단순 매칭).
  search?: string;
  // 특정 조문에 연결된 문제만.
  primaryArticleId?: string;
  // 분류되지 않은 choice 가 1개 이상인 문제만 (운영자 보강 대기열).
  hasUnclassified?: boolean;
  // 검토 상태 필터: 'reviewed' = 완료, 'pending' = 미검토, 'mismatch' = 재검토 필요.
  reviewStatus?: "reviewed" | "pending" | "mismatch";
  // 해설 미디어 필터: 'table' = 표 포함, 'image' = 이미지 포함, 'any' = 둘 중 하나, 'none' = 둘 다 없음.
  mediaStatus?: "table" | "image" | "any" | "none";
}

// 문제 목록 — 체계도 / 조문 순서로 정렬. primary_article 의 ltree path 가 있으면 그것 기준,
// 없으면 origin → year DESC → problem_number 로 fallback.
// unclassified 카운트는 choice_type IS NULL 인 지문 수 (운영자 보강 진행도 표시용).
export async function listProblemsBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  filters: ListProblemsFilters = {},
  opts: { includeHiddenMock?: boolean; includeUnapproved?: boolean } = {},
): Promise<ProblemListItem[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  // 필터가 적용된 기본 쿼리 빌더 — 페이징 루프에서 매 페이지 새로 생성(빌더 재사용 금지).
  const buildQuery = () => {
    let query = client
      .from("problems")
      .select(
        "problem_id, display_no, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, exam_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, rubric_ai_generated_at, rubric_reviewed_at, articles!primary_article_id(article_number, display_label, path)",
      )
      .eq("law_id", law.law_id)
      .is("deleted_at", null);

    // feat-10-002: 미공개 mock 문제(origin=mock·released_at null)는 학습과목 비노출.
    // staff 문제 관리 화면(admin-problems-list)만 includeHiddenMock 으로 우회한다.
    if (!opts.includeHiddenMock) {
      query = query.or("origin.neq.mock,released_at.not.is.null");
    }

    // feat — 강사 검증 게이트. review_status='approved' 만 학생 노출. 기존 풀은 마이그
    //   에서 일괄 approved backfill, 신규 (AI ai_draft + 수기) 만 draft 시작. staff 검증
    //   화면은 includeUnapproved 로 우회.
    if (!opts.includeUnapproved) {
      query = query.eq("review_status", "approved");
    }

    if (filters.origins && filters.origins.length > 0) {
      query = query.in("origin", filters.origins);
    } else if (filters.origin) {
      query = query.eq("origin", filters.origin);
    }
    if (filters.format) query = query.eq("format", filters.format);
    if (filters.polarity) query = query.eq("polarity", filters.polarity);
    if (filters.scope) query = query.eq("scope", filters.scope);
    if (filters.examRound) query = query.eq("exam_round", filters.examRound);
    if (filters.year != null) query = query.eq("year", filters.year);
    if (filters.search && filters.search.trim().length > 0) {
      // PostgREST .ilike() — % 와 _ 만 와일드카드로 escape 후 양쪽 % 추가.
      const raw = filters.search.trim();
      const safe = raw.replace(/[%_]/g, (m) => `\\${m}`);
      // 문제 고유번호("P-5966" / "p 5966" / "5966")로도 찾게 한다 — 화면의 복사 칩이
      //   P-번호를 주는데 검색이 본문만 훑어 0건이 되던 문제(2026-08-15 신고).
      //   본문 검색과 OR 결합이라 기존 본문 검색 결과는 그대로 유지된다.
      const noMatch = /^p?[-\s]?(\d{1,9})$/i.exec(raw);
      if (noMatch) {
        query = query.or(
          `display_no.eq.${noMatch[1]},body_md.ilike.%${safe}%`,
        );
      } else {
        query = query.ilike("body_md", `%${safe}%`);
      }
    }
    if (filters.primaryArticleId)
      query = query.eq("primary_article_id", filters.primaryArticleId);
    if (filters.reviewStatus === "reviewed")
      query = query.not("reviewed_at", "is", null);
    else if (filters.reviewStatus === "pending")
      query = query.is("reviewed_at", null);
    else if (filters.reviewStatus === "mismatch")
      query = query.not("mismatch_flagged_at", "is", null);

    return query;
  };

  // PostgREST 기본 max-rows=1000 — 페이지로 끝까지 수집(특허 1112문항 등 1000 초과 과목이
  //   1000 에서 잘리던 버그). ★ created_at 은 비유일 → problem_id 타이브레이커로 안정 페이징.
  const PAGE = 1000;
  const rows: NonNullable<Awaited<ReturnType<typeof buildQuery>>["data"]> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery()
      .order("created_at", { ascending: true })
      .order("problem_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // unclassified choice 카운트 — mc_box 는 choice 자체가 보기묶음(예: "㉮㉯") 이라 분류 불필요 → 제외.
  // 동시에 choice 해설에 표/이미지가 있는지도 같이 검출 (해설은 problem-level + choice-level + box-level 어디든 들어감).
  const problemIds = rows.map((r) => r.problem_id);
  const mcBoxIds = new Set(
    rows.filter((r) => r.format === "mc_box").map((r) => r.problem_id),
  );
  const unclassifiedByProblem = new Map<string, number>();
  const mediaByProblem = new Map<
    string,
    { hasTable: boolean; hasImage: boolean }
  >();
  // problem-level explanation 먼저 검사.
  for (const r of rows) {
    mediaByProblem.set(r.problem_id, {
      hasTable: hasTableMd(r.explanation_md),
      hasImage: hasImageMd(r.explanation_md),
    });
  }
  if (problemIds.length > 0) {
    // PostgREST 의 (1) max-rows=1000 행 제한, (2) URL 길이 제한 때문에
    // .in() 에 500+개 UUID 를 넣으면 쿼리가 잘리거나 실패한다.
    // → ID 를 청크 단위로 나눠 여러 번 호출 + 행 limit 명시.
    const CHUNK = 100;
    const allChoiceRows: Array<{
      problem_id: string;
      choice_type: string | null;
      explanation_md: string | null;
    }> = [];
    const allBoxRows: Array<{
      problem_id: string;
      explanation_md: string | null;
    }> = [];
    for (let i = 0; i < problemIds.length; i += CHUNK) {
      const ids = problemIds.slice(i, i + CHUNK);
      const { data: choiceRows } = await client
        .from("problem_choices")
        .select("problem_id, choice_type, explanation_md")
        .in("problem_id", ids)
        .limit(10000);
      if (choiceRows) allChoiceRows.push(...choiceRows);
      const { data: boxRows } = await client
        .from("problem_box_items")
        .select("problem_id, explanation_md")
        .in("problem_id", ids)
        .limit(10000);
      if (boxRows) allBoxRows.push(...boxRows);
    }
    for (const c of allChoiceRows) {
      if (!mcBoxIds.has(c.problem_id) && c.choice_type === null) {
        unclassifiedByProblem.set(
          c.problem_id,
          (unclassifiedByProblem.get(c.problem_id) ?? 0) + 1,
        );
      }
      const m = mediaByProblem.get(c.problem_id);
      if (m) {
        if (!m.hasTable && hasTableMd(c.explanation_md)) m.hasTable = true;
        if (!m.hasImage && hasImageMd(c.explanation_md)) m.hasImage = true;
      }
    }
    for (const b of allBoxRows) {
      const m = mediaByProblem.get(b.problem_id);
      if (m) {
        if (!m.hasTable && hasTableMd(b.explanation_md)) m.hasTable = true;
        if (!m.hasImage && hasImageMd(b.explanation_md)) m.hasImage = true;
      }
    }
  }

  let mapped: ProblemListItem[] = rows.map((row) => {
    const m = mediaByProblem.get(row.problem_id) ?? {
      hasTable: false,
      hasImage: false,
    };
    return {
      problemId: row.problem_id,
      examRound: row.exam_round,
      format: row.format,
      origin: row.origin,
      polarity: row.polarity,
      scope: row.scope,
      year: row.year,
      examRoundNo: row.exam_round_no,
      problemNumber: row.problem_number,
      examNumber: row.exam_number,
      displayNo: row.display_no,
      overallNo: null,
      bodyMd: row.body_md,
      importance: row.importance ?? 0,
      primaryArticleId: row.primary_article_id,
      primaryArticleNumber: row.articles?.article_number ?? null,
      primaryArticleLabel: row.articles?.display_label ?? null,
      unclassifiedChoices: unclassifiedByProblem.get(row.problem_id) ?? 0,
      reviewedAt: row.reviewed_at,
      mismatchFlaggedAt: row.mismatch_flagged_at,
      explanationMd: row.explanation_md,
      modelAnswerMd: row.model_answer_md,
      gradingRubricMd: row.grading_rubric_md,
      videoUrl: row.video_url,
      subjectiveKind: row.subjective_kind,
      subjectiveKeywords: row.subjective_keywords,
      subjectiveTopic: row.subjective_topic,
      rubricItems: parseRubricItems(row.rubric_items),
    rubricAiGeneratedAt: row.rubric_ai_generated_at,
    rubricReviewedAt: row.rubric_reviewed_at,
      hasTable: m.hasTable,
      hasImage: m.hasImage,
    };
  });

  if (filters.hasUnclassified) {
    mapped = mapped.filter((p) => p.unclassifiedChoices > 0);
  }
  if (filters.mediaStatus === "table") {
    mapped = mapped.filter((p) => p.hasTable);
  } else if (filters.mediaStatus === "image") {
    mapped = mapped.filter((p) => p.hasImage);
  } else if (filters.mediaStatus === "any") {
    mapped = mapped.filter((p) => p.hasTable || p.hasImage);
  } else if (filters.mediaStatus === "none") {
    mapped = mapped.filter((p) => !p.hasTable && !p.hasImage);
  }

  // 정렬 — 조문 순서.
  //   path 는 "patent.ch01.a29" / "patent.ch01.a28_02" 형식이며 zero-padding 이 없어
  //   문자열 정렬하면 a1 → a10..a19 → a2 식으로 어긋난다. segment 별로 숫자 추출 후
  //   숫자 비교하는 natural sort 키를 만들어 정렬한다.
  const pathByProblem = new Map(
    rows.map((r) => [
      r.problem_id,
      r.articles?.path ? String(r.articles.path) : null,
    ]),
  );
  mapped.sort((a, b) => {
    const pa = pathByProblem.get(a.problemId);
    const pb = pathByProblem.get(b.problemId);
    // 조문 미연결 문제는 끝으로.
    if (pa == null && pb == null) {
      // pass — fall through to year/number tiebreaker
    } else if (pa == null) return 1;
    else if (pb == null) return -1;
    else {
      const cmp = compareArticlePath(pa, pb);
      if (cmp !== 0) return cmp;
    }
    if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });

  return mapped;
}

// 체계도 전체 순번 — 과목 문제를 체계도 노드 트리 순(노드 내는 listProblemsBySubject 기본순 유지)으로
// 줄 세워 1..N 의 overallNo 를 in-place 부여. 노드 귀속 = primary_node_id 직접 + primary_article_id
//   → article_systematic_links 파생(다중 연결 시 트리에서 가장 이른 노드). 배치가 바뀌면 매 호출
//   재계산되는 파생값(저장 안 함). problems 는 listProblemsBySubject 가 돌려준 기본순 배열.
export async function attachProblemOverallNo(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  problems: ProblemListItem[],
): Promise<void> {
  if (problems.length === 0) return;
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return;

  const { data: nodesData } = await client
    .from("systematic_nodes")
    .select("node_id, parent_id, ord, path")
    .eq("law_code", lawCode);
  // ★path 문자열 정렬은 대분류 10개 초과 시 깨짐(b13 < b2) — 트리 순(parent+ord DFS)으로 랭킹.
  const nodes = sortSystematicTreeOrder(
    (nodesData ?? []).map((n) => ({
      nodeId: n.node_id,
      parentId: n.parent_id,
      ord: n.ord,
      path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
      node_id: n.node_id,
    })),
  );
  // ★링크·문제는 1000행(max-rows) 초과 가능(민법 링크 1193·특허 문제 1176) — 배치 헬퍼로 전량 조회.
  const [aslRows, placRows] = await Promise.all([
    fetchAllIn(
      nodes.map((n) => n.node_id),
      (slice) =>
        client
          .from("article_systematic_links")
          .select("article_id, node_id")
          .in("node_id", slice)
          .order("article_id"),
    ),
    fetchAllPages(() =>
      client
        .from("problems")
        .select("problem_id, primary_node_id")
        .eq("law_id", law.law_id)
        .is("deleted_at", null)
        .order("problem_id"),
    ),
  ]);

  const nodeRank = new Map<string, number>();
  nodes.forEach((n, i) => nodeRank.set(n.node_id, i));

  // 조문 → 트리에서 가장 이른(rank 최소) 노드 rank.
  const articleMinRank = new Map<string, number>();
  for (const r of aslRows) {
    const rank = nodeRank.get(r.node_id);
    if (rank === undefined) continue;
    const cur = articleMinRank.get(r.article_id);
    if (cur === undefined || rank < cur) articleMinRank.set(r.article_id, rank);
  }

  const primaryNodeByProblem = new Map<string, string | null>();
  for (const r of placRows)
    primaryNodeByProblem.set(r.problem_id, r.primary_node_id);

  const UNPLACED = nodes.length; // 미배치는 맨 뒤.
  const rankOf = (p: ProblemListItem): number => {
    const pn = primaryNodeByProblem.get(p.problemId);
    if (pn != null) {
      const r = nodeRank.get(pn);
      if (r !== undefined) return r;
    }
    if (p.primaryArticleId != null) {
      const r = articleMinRank.get(p.primaryArticleId);
      if (r !== undefined) return r;
    }
    return UNPLACED;
  };

  // 기본 정렬 = 체계도 노드 트리 순(1차) → 노드 내 문항번호(No.) 오름차순(2차).
  //   동률(같은 노드·같은 No.: 기출/예상 워크북 각자 1번 중복 등)은 V8 stable 정렬로 기존 순서 유지.
  //   problems 배열을 in-place 재정렬해 기본 표시 순서도 이 순서를 따르게 한다(overallNo = 그 위치).
  const rankByProblem = new Map<string, number>(
    problems.map((p) => [p.problemId, rankOf(p)]),
  );
  problems.sort(
    (a, b) =>
      (rankByProblem.get(a.problemId) ?? UNPLACED) -
        (rankByProblem.get(b.problemId) ?? UNPLACED) ||
      (a.problemNumber ?? Number.POSITIVE_INFINITY) -
        (b.problemNumber ?? Number.POSITIVE_INFINITY),
  );
  problems.forEach((p, i) => {
    p.overallNo = i + 1;
  });
}

// 표 검출 — 마크다운 표(`| --- |` 헤더 구분 행) 또는 raw HTML `<table>` 둘 중 하나.
function hasTableMd(md: string | null | undefined): boolean {
  if (!md) return false;
  if (/<table[\s>]/i.test(md)) return true;
  return /\n\s*\|[\s-:|]+\|\s*\n/.test("\n" + md + "\n");
}

// 마크다운 이미지(`![alt](url)`) 또는 raw HTML `<img` 검출.
function hasImageMd(md: string | null | undefined): boolean {
  if (!md) return false;
  return md.includes("![") || md.includes("<img");
}

// "patent.ch01.a28_02" → [(0,"patent"), (1,1), (1,28), (2,2)] 로 분해해 숫자 segment 는 숫자로 비교.
// 조문 가지조 표기(28의2)는 path 에 "_02" suffix 로 들어가므로 같은 a-segment 내에서
// 메인 vs 가지조 비교를 자연스럽게 처리하기 위해 동일 a-token 안에 [main, sub] 페어로 둔다.
function articlePathKey(path: string): (string | number)[] {
  const segs = path.split(".");
  const out: (string | number)[] = [];
  for (const s of segs) {
    // "ch01" → ["ch", 1] / "a28_02" → ["a", 28, 2] / "a29" → ["a", 29, 0]
    const m = s.match(/^([a-z]+)(\d+)(?:_(\d+))?$/i);
    if (m) {
      out.push(m[1].toLowerCase());
      out.push(parseInt(m[2], 10));
      out.push(m[3] ? parseInt(m[3], 10) : 0);
    } else {
      out.push(s);
    }
  }
  return out;
}

function compareArticlePath(a: string, b: string): number {
  const ka = articlePathKey(a);
  const kb = articlePathKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i];
    const y = kb[i];
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else {
      const sx = String(x);
      const sy = String(y);
      if (sx !== sy) return sx < sy ? -1 : 1;
    }
  }
  return ka.length - kb.length;
}

// 최근 등록된 객관식 문제 — /latest/mcq 통합 피드.
export interface RecentProblemItem {
  problemId: string;
  bodySnippet: string;
  /** 스니펫을 본문 등장 순서대로 텍스트/이미지 토큰으로 분해 — 도형이 원위치에 인라인 렌더되도록. */
  snippetParts: Array<{ t: "text" | "img"; v: string }>;
  /** 본문 전체 이미지 수 — 스니펫 밖(첨부 도면 등)까지 포함한 목록 배지용. */
  imageCount: number;
  format: string;
  origin: string;
  year: number | null;
  problemNumber: number | null;
  createdAt: string;
  lawCode: string;
  subjectiveKind: "case_based" | "theory" | "mixed" | null;
  subjectiveTopic: string | null;
}

export interface ListRecentProblemsOptions {
  limit?: number;
  formatFilter?: "mcq" | "subjective";
  subject?: string; // law_code
  year?: number;
  origin?: ProblemOrigin;
  query?: string; // body_md substring
  subjectiveKind?: "case_based" | "theory" | "mixed";
  subjectiveKeyword?: string; // single keyword - array contains
}

export async function listRecentProblems(
  client: SupabaseClient<Database>,
  optionsOrLimit: ListRecentProblemsOptions | number = 50,
  formatFilterArg: "mcq" | "subjective" = "mcq",
): Promise<RecentProblemItem[]> {
  // 하위 호환: 기존 (client, limit, formatFilter) 시그니처 유지.
  const options: ListRecentProblemsOptions =
    typeof optionsOrLimit === "number"
      ? { limit: optionsOrLimit, formatFilter: formatFilterArg }
      : optionsOrLimit;
  const limit = options.limit ?? 50;
  const formatFilter = options.formatFilter ?? "mcq";
  const formats: ProblemFormat[] =
    formatFilter === "mcq"
      ? ["mc_short", "mc_box", "mc_case", "ox", "blank"]
      : ["subjective"];
  let q = client
    .from("problems")
    .select(
      "problem_id, body_md, format, origin, year, exam_round_no, problem_number, created_at, subjective_kind, subjective_topic, laws!inner(law_code)",
    )
    .in("format", formats)
    .is("deleted_at", null);
  if (options.subject) q = q.eq("laws.law_code", options.subject);
  if (options.year !== undefined) q = q.eq("year", options.year);
  if (options.origin) q = q.eq("origin", options.origin);
  if (options.subjectiveKind)
    q = q.eq("subjective_kind", options.subjectiveKind);
  if (options.subjectiveKeyword) {
    q = q.contains("subjective_keywords", [options.subjectiveKeyword]);
  }
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.ilike("body_md", pattern);
  }
  // 2차(주관식) 목록은 시험(연도·회차) 최신순 + 문제번호 오름차순(1,2,3,4).
  //   mcq LATEST 피드는 종전대로 등록일 최신순.
  const ordered =
    formatFilter === "subjective"
      ? q
          .order("year", { ascending: false, nullsFirst: false })
          .order("exam_round_no", { ascending: false, nullsFirst: false })
          .order("problem_number", { ascending: true, nullsFirst: false })
      : q.order("created_at", { ascending: false });
  const { data, error } = await ordered.limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  // 같은 시험(연도·회차) 안에서는 과목 고정 순서(특허→상표→디자인→…)로 묶고
  // 과목 내 문제번호 오름차순 — "2025 특허법 1,2,3,4 → 2025 상표법 1,2,3,4".
  // law_code 커스텀 순서는 DB 정렬로 표현이 안 되므로 fetch 후 재정렬.
  if (formatFilter === "subjective") {
    const subjectRank = new Map<string, number>(
      LAW_SUBJECT_SLUGS.map((s, i) => [s, i]),
    );
    const rank = (code: string) => subjectRank.get(code) ?? LAW_SUBJECT_SLUGS.length;
    rows.sort(
      (a, b) =>
        (b.year ?? -1) - (a.year ?? -1) ||
        (b.exam_round_no ?? -1) - (a.exam_round_no ?? -1) ||
        rank(a.laws.law_code) - rank(b.laws.law_code) ||
        (a.problem_number ?? Number.MAX_SAFE_INTEGER) -
          (b.problem_number ?? Number.MAX_SAFE_INTEGER),
    );
  }
  return rows.map((r) => {
    const body = r.body_md ?? "";
    // 스니펫을 텍스트/이미지 토큰으로 분해 — 도형(![](url))이 본문 등장 위치 그대로
    // 카드에서 인라인 렌더되도록. 텍스트 예산(100자)까지만 담고 이미지 토큰은 자르지 않는다.
    const BUDGET = 100;
    const snippetParts: Array<{ t: "text" | "img"; v: string }> = [];
    let used = 0;
    let cursor = 0;
    let clipped = false;
    for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const before = body.slice(cursor, m.index);
      if (used + before.length > BUDGET) {
        snippetParts.push({ t: "text", v: `${before.slice(0, BUDGET - used)}…` });
        used = BUDGET;
        clipped = true;
        break;
      }
      if (before) snippetParts.push({ t: "text", v: before });
      used += before.length;
      snippetParts.push({ t: "img", v: m[1] });
      cursor = (m.index ?? 0) + m[0].length;
    }
    if (!clipped) {
      const rest = body.slice(cursor);
      snippetParts.push({
        t: "text",
        v: used + rest.length > BUDGET ? `${rest.slice(0, BUDGET - used)}…` : rest,
      });
    }
    const textOnly = body
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/[ \t]{2,}/g, " ");
    return {
      problemId: r.problem_id,
      bodySnippet:
        textOnly.length > 100 ? `${textOnly.slice(0, 100)}…` : textOnly,
      snippetParts,
      imageCount: (body.match(/!\[[^\]]*\]\(/g) ?? []).length,
      format: r.format,
      origin: r.origin,
      year: r.year,
      problemNumber: r.problem_number,
      createdAt: r.created_at,
      lawCode: r.laws.law_code,
      subjectiveKind: r.subjective_kind,
      subjectiveTopic: r.subjective_topic,
    };
  });
}

// 정오문제 — 특정 조문에 연결된 OX 가능 지문 (객관식 choice + box-item 통합).
// article-viewer 우측 "정오문제" 탭에서 무작위 풀이용.
// 타입(OxTruth, OxQuestionItem, OxRefAnnotations) 은 ./labels 에 정의 — RR vite plugin
// 의 module-graph 분석이 component → loader 타입 추적 시 `.server.ts` 의존성을 만들지 않게.

// 운영자 OX 검토용 — 학생 노출(ox_truth NOT NULL + ineligible=false + article 매핑) 조건과
// 무관하게 후보 지문을 모두 조회. 운영자는 이 화면에서 ox_truth 수정 / ineligible 토글 가능.
export type OxReviewStatus =
  | "all"
  | "active"
  | "ineligible"
  | "untruthed"
  | "unmapped"
  | "hidden";
export interface OxReviewItem {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  problemNumber: number | null;
  year: number | null;
  origin: string;
  bodyMd: string;
  marker: string | null; // box-item 만
  oxTruth: OxTruth | null;
  oxIneligible: boolean;
  // 스태프 수동 숨김 — OX 패널·검수에서 토글. ineligible(구조적)과 구분.
  oxHidden: boolean;
  relatedArticleId: string | null;
  relatedArticleLabel: string | null;
  relatedArticleNumber: string | null;
  isCorrect: boolean | null; // choice 만 (auto 추론 참고)
  // OX 표시 전용 지문 오버라이드 존재 여부(choice 만) — bodyMd 는 이미 오버라이드 반영값.
  oxBodyOverridden: boolean;
}

export async function listOxItemsForReview(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  filters: {
    status?: OxReviewStatus;
    articleId?: string | null;
    year?: number | null;
    limit?: number;
  } = {},
): Promise<OxReviewItem[]> {
  const status: OxReviewStatus = filters.status ?? "all";
  const limit = filters.limit ?? 500;

  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .single();
  if (!law) return [];

  const out: OxReviewItem[] = [];

  // 1) problem_choices.
  let choiceQuery = client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_body_md, ox_truth, ox_ineligible, ox_hidden_at, related_article_id, is_correct, problems!inner(year, problem_number, origin, deleted_at, law_id)",
    )
    .eq("problems.law_id", law.law_id)
    .limit(limit);
  if (filters.articleId) {
    choiceQuery = choiceQuery.eq("related_article_id", filters.articleId);
  }
  if (filters.year != null) {
    choiceQuery = choiceQuery.eq("problems.year", filters.year);
  }
  const { data: choiceRows } = await choiceQuery;
  for (const r of choiceRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "choice",
      refId: r.choice_id,
      problemId: r.problem_id,
      problemNumber: r.problems.problem_number,
      year: r.problems.year,
      origin: r.problems.origin,
      bodyMd: r.ox_body_md ?? r.body_md,
      marker: null,
      oxTruth: r.ox_truth as OxTruth | null,
      oxIneligible: r.ox_ineligible ?? false,
      oxHidden: r.ox_hidden_at != null,
      relatedArticleId: r.related_article_id,
      relatedArticleLabel: null,
      relatedArticleNumber: null,
      isCorrect: r.is_correct ?? null,
      oxBodyOverridden: r.ox_body_md != null,
    });
  }

  // 2) problem_box_items.
  let boxQuery = client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, body_md, marker, ox_truth, ox_ineligible, ox_hidden_at, related_article_id, problems!inner(year, problem_number, origin, deleted_at, law_id)",
    )
    .eq("problems.law_id", law.law_id)
    .limit(limit);
  if (filters.articleId) {
    boxQuery = boxQuery.eq("related_article_id", filters.articleId);
  }
  if (filters.year != null) {
    boxQuery = boxQuery.eq("problems.year", filters.year);
  }
  const { data: boxRows } = await boxQuery;
  for (const r of boxRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "box",
      refId: r.box_item_id,
      problemId: r.problem_id,
      problemNumber: r.problems.problem_number,
      year: r.problems.year,
      origin: r.problems.origin,
      bodyMd: r.body_md,
      marker: r.marker,
      oxTruth: r.ox_truth as OxTruth | null,
      oxIneligible: r.ox_ineligible ?? false,
      oxHidden: r.ox_hidden_at != null,
      relatedArticleId: r.related_article_id,
      relatedArticleLabel: null,
      relatedArticleNumber: null,
      isCorrect: null,
      oxBodyOverridden: false,
    });
  }

  // 3) 상태 필터 — DB 단에서 mixed AND/OR 가 복잡해 메모리에서 처리.
  const filtered = out.filter((it) => {
    if (status === "active") {
      return (
        it.oxIneligible === false &&
        it.oxTruth != null &&
        it.relatedArticleId != null
      );
    }
    if (status === "ineligible") {
      return it.oxIneligible === true;
    }
    if (status === "untruthed") {
      return (
        !it.oxIneligible && (it.oxTruth == null || it.relatedArticleId == null)
      );
    }
    // 조문 미매칭 — 정오 가능 + 정답 설정됐는데 조문만 없는 것 (매칭 큐 대상).
    if (status === "unmapped") {
      return (
        !it.oxIneligible && it.oxTruth != null && it.relatedArticleId == null
      );
    }
    if (status === "hidden") {
      return it.oxHidden === true;
    }
    return true;
  });

  // 4) 매핑된 article id 들에 대해 라벨/번호 보강.
  const articleIds = Array.from(
    new Set(
      filtered
        .map((it) => it.relatedArticleId)
        .filter((x): x is string => x != null),
    ),
  );
  if (articleIds.length > 0) {
    const { data: arts } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .in("article_id", articleIds);
    const map = new Map<
      string,
      { displayLabel: string; articleNumber: string | null }
    >();
    for (const a of arts ?? []) {
      map.set(a.article_id, {
        displayLabel: a.display_label,
        articleNumber: a.article_number,
      });
    }
    for (const it of filtered) {
      if (it.relatedArticleId) {
        const a = map.get(it.relatedArticleId);
        if (a) {
          it.relatedArticleLabel = a.displayLabel;
          it.relatedArticleNumber = a.articleNumber;
        }
      }
    }
  }

  // 5) 정렬 — 연도 DESC, 문항 ASC, refType (choice 먼저), refId 안정 정렬.
  filtered.sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya !== yb) return yb - ya;
    const pa = a.problemNumber ?? 0;
    const pb = b.problemNumber ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.refType !== b.refType) return a.refType === "choice" ? -1 : 1;
    return a.refId.localeCompare(b.refId);
  });

  return filtered.slice(0, limit);
}

// 운영자가 review 화면에서 OX 한 항목을 수정할 때 사용.
// truth 와 ineligible 의 cross-rule(ineligible=true → truth=null)을 서버에서 강제.
export async function updateOxReviewItem(
  client: SupabaseClient<Database>,
  refType: "choice" | "box",
  refId: string,
  patch: {
    oxTruth?: OxTruth | null;
    oxIneligible?: boolean;
    // OX 패널 표시 전용 지문 오버라이드 — null 로 해제(원문 body_md 표시). choice 전용 컬럼.
    oxBodyMd?: string | null;
    // 스태프 수동 숨김 — true 면 ox_hidden_at=now·ox_hidden_by=hiddenBy, false 면 둘 다 null.
    hidden?: boolean;
    hiddenBy?: string | null;
    nowIso?: string;
  },
): Promise<void> {
  const ineligible = patch.oxIneligible ?? undefined;
  const truth =
    ineligible === true
      ? null
      : patch.oxTruth === undefined
        ? undefined
        : patch.oxTruth;

  const update: Record<string, unknown> = {};
  if (truth !== undefined) update.ox_truth = truth;
  if (ineligible !== undefined) update.ox_ineligible = ineligible;
  if (patch.oxBodyMd !== undefined && refType === "choice")
    update.ox_body_md = patch.oxBodyMd;
  if (patch.hidden !== undefined) {
    update.ox_hidden_at = patch.hidden
      ? (patch.nowIso ?? new Date().toISOString())
      : null;
    update.ox_hidden_by = patch.hidden ? (patch.hiddenBy ?? null) : null;
  }
  if (Object.keys(update).length === 0) return;

  if (refType === "choice") {
    const { error } = await client
      .from("problem_choices")
      .update(update)
      .eq("choice_id", refId);
    if (error) throw error;
  } else {
    const { error } = await client
      .from("problem_box_items")
      .update(update)
      .eq("box_item_id", refId);
    if (error) throw error;
  }
}

// 운영자가 review 화면에서 지문의 관련 조문을 연결/해제할 때 사용.
// articleNumber 는 "126"·"826의2" 형식 — 해당 과목 조문(level=article)에 실재해야 연결.
export async function setOxItemArticle(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  refType: "choice" | "box",
  refId: string,
  articleNumber: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let articleId: string | null = null;
  if (articleNumber) {
    const { data: law } = await client
      .from("laws")
      .select("law_id")
      .eq("law_code", lawCode)
      .single();
    if (!law) return { ok: false, error: "과목을 찾을 수 없습니다" };
    const { data: art } = await client
      .from("articles")
      .select("article_id")
      .eq("law_id", law.law_id)
      .eq("level", "article")
      .eq("article_number", articleNumber)
      .maybeSingle();
    if (!art)
      return { ok: false, error: `제${articleNumber}조를 찾을 수 없습니다` };
    articleId = art.article_id;
  }
  const patch = {
    related_article_id: articleId,
    related_article_number: articleNumber,
  };
  const table = refType === "choice" ? "problem_choices" : "problem_box_items";
  const idCol = refType === "choice" ? "choice_id" : "box_item_id";
  const { error } = await client.from(table).update(patch).eq(idCol, refId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 조문 매칭 AI 제안 (ox_article_suggestions) ─────────────────────────────
// 테이블은 RLS 정책 없음(service_role 전용) — 운영자 화면 전용 데이터라 adminClient 로만
// 접근한다. 호출부(loader/action)는 staff 게이트 통과가 전제.
export interface OxArticleSuggestion {
  refType: "choice" | "box";
  refId: string;
  suggestedArticleNumber: string | null;
  rationale: string | null;
  verified: boolean;
  status: "pending" | "approved" | "rejected" | "no_article";
}

export async function getOxArticleSuggestions(
  refIds: string[],
): Promise<Map<string, OxArticleSuggestion>> {
  const map = new Map<string, OxArticleSuggestion>();
  if (refIds.length === 0) return map;
  const rows = await fetchAllIn(refIds, (ids) =>
    adminClient
      .from("ox_article_suggestions")
      .select(
        "ref_type, ref_id, suggested_article_number, rationale, verified, status",
      )
      .in("ref_id", ids)
      .order("suggestion_id"),
  );
  for (const r of rows) {
    map.set(`${r.ref_type}:${r.ref_id}`, {
      refType: r.ref_type as "choice" | "box",
      refId: r.ref_id,
      suggestedArticleNumber: r.suggested_article_number,
      rationale: r.rationale,
      verified: r.verified,
      status: r.status as OxArticleSuggestion["status"],
    });
  }
  return map;
}

// 운영자 결정 기록 — approved(제안 승인)/rejected(다른 조문 수동 연결)/no_article(조문 없음 확정).
// 제안 행이 없는 지문(수동 연결 등)의 결정도 기록해야 큐에서 빠진다 → upsert.
export async function decideOxArticleSuggestion(
  refType: "choice" | "box",
  refId: string,
  problemId: string,
  lawCode: string,
  status: "approved" | "rejected" | "no_article",
  decidedBy: string,
): Promise<void> {
  const { error } = await adminClient.from("ox_article_suggestions").upsert(
    {
      ref_type: refType,
      ref_id: refId,
      problem_id: problemId,
      law_code: lawCode,
      status,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
    },
    { onConflict: "ref_type,ref_id" },
  );
  if (error) throw error;
}

// 본인의 OX 오답 노트 — user_problem_attempts.ox_answer IS NOT NULL 의 최근 응시가
// is_correct=false 인 지문만 모은다. 같은 지문을 여러 번 응시한 경우 최근 한 번만 사용.
export interface OxWrongItem extends OxQuestionItem {
  lastAttemptAt: string;
  userAnswerAtLast: OxTruth;
}

export async function listMyOxWrongNoteItems(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 100,
): Promise<OxWrongItem[]> {
  const { data: attempts } = await client
    .from("user_problem_attempts")
    .select(
      "attempted_at, problem_id, selected_choice_id, selected_box_item_id, ox_answer, is_correct",
    )
    .eq("user_id", userId)
    .not("ox_answer", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(2000); // distinct 처리에 충분한 윈도우
  const wrongRefs: {
    problemId: string;
    refType: "choice" | "box";
    refId: string;
    lastAt: string;
    userAnswer: OxTruth;
  }[] = [];
  const seen = new Set<string>();
  for (const a of attempts ?? []) {
    const refId = a.selected_choice_id ?? a.selected_box_item_id;
    if (!refId) continue;
    if (seen.has(refId)) continue;
    seen.add(refId);
    if (a.is_correct) continue;
    wrongRefs.push({
      problemId: a.problem_id,
      refType: a.selected_choice_id ? "choice" : "box",
      refId,
      lastAt: a.attempted_at,
      userAnswer: a.ox_answer as OxTruth,
    });
    if (wrongRefs.length >= limit) break;
  }
  if (wrongRefs.length === 0) return [];

  const out: OxWrongItem[] = [];

  const choiceIds = wrongRefs
    .filter((w) => w.refType === "choice")
    .map((w) => w.refId);
  if (choiceIds.length > 0) {
    const { data: rows } = await client
      .from("problem_choices")
      .select(
        "choice_id, problem_id, body_md, ox_body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
      )
      .in("choice_id", choiceIds)
      .not("ox_truth", "is", null);
    for (const r of rows ?? []) {
      if (r.problems.deleted_at) continue;
      const wr = wrongRefs.find((w) => w.refId === r.choice_id);
      if (!wr) continue;
      out.push({
        refType: "choice",
        refId: r.choice_id,
        problemId: r.problem_id,
        bodyMd: r.ox_body_md ?? r.body_md,
        oxTruth: r.ox_truth as OxTruth,
        explanationMd: r.explanation_md,
        year: r.problems.year,
        problemNumber: r.problems.problem_number,
        origin: r.problems.origin,
        lastAttemptAt: wr.lastAt,
        userAnswerAtLast: wr.userAnswer,
      });
    }
  }

  const boxIds = wrongRefs
    .filter((w) => w.refType === "box")
    .map((w) => w.refId);
  if (boxIds.length > 0) {
    const { data: rows } = await client
      .from("problem_box_items")
      .select(
        "box_item_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
      )
      .in("box_item_id", boxIds)
      .not("ox_truth", "is", null);
    for (const r of rows ?? []) {
      if (r.problems.deleted_at) continue;
      const wr = wrongRefs.find((w) => w.refId === r.box_item_id);
      if (!wr) continue;
      out.push({
        refType: "box",
        refId: r.box_item_id,
        problemId: r.problem_id,
        bodyMd: r.body_md,
        oxTruth: r.ox_truth as OxTruth,
        explanationMd: r.explanation_md,
        year: r.problems.year,
        problemNumber: r.problems.problem_number,
        origin: r.problems.origin,
        lastAttemptAt: wr.lastAt,
        userAnswerAtLast: wr.userAnswer,
      });
    }
  }

  out.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
  return out;
}

// 본인의 OX 오답 노트 카운트 — listMyOxWrongNoteItems 와 동일 distinct 규칙이지만 본문 fetch 없이 숫자만.
// 대시보드 카드 등 가벼운 표시용. 윈도우 2000 응시 안에서 distinct 한 오답 refId 개수.
export async function countMyOxWrongNoteItems(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { data: attempts } = await client
    .from("user_problem_attempts")
    .select("selected_choice_id, selected_box_item_id, is_correct")
    .eq("user_id", userId)
    .not("ox_answer", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  const seen = new Set<string>();
  let n = 0;
  for (const a of attempts ?? []) {
    const refId = a.selected_choice_id ?? a.selected_box_item_id;
    if (!refId) continue;
    if (seen.has(refId)) continue;
    seen.add(refId);
    if (!a.is_correct) n++;
  }
  return n;
}

// 진도별 모의고사 팩(mcq_packs.kind=mock_progressive)의 OX 시험 모드 풀이용.
// 팩의 문제(mcq_pack_problems)들의 problem_choices · problem_box_items 중
// ox_truth IS NOT NULL AND ox_ineligible=false 인 지문 모두 반환.
// 순서: 팩의 ord → 문제 안에서 choice 먼저, box 나중.
export async function getOxQuestionsForPack(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<OxQuestionItem[]> {
  const { data: packProblems, error: ppErr } = await client
    .from("mcq_pack_problems")
    .select("problem_id, ord")
    .eq("pack_id", packId)
    .order("ord", { ascending: true });
  if (ppErr) throw ppErr;
  const problemIds = (packProblems ?? []).map((p) => p.problem_id);
  if (problemIds.length === 0) return [];

  const out: OxQuestionItem[] = [];

  const { data: choiceRows } = await client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
    )
    .in("problem_id", problemIds)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null);
  for (const r of choiceRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "choice",
      refId: r.choice_id,
      problemId: r.problem_id,
      bodyMd: r.ox_body_md ?? r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
    });
  }

  const { data: boxRows } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
    )
    .in("problem_id", problemIds)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null);
  for (const r of boxRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "box",
      refId: r.box_item_id,
      problemId: r.problem_id,
      bodyMd: r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
    });
  }

  const ordMap = new Map<string, number>();
  (packProblems ?? []).forEach((p) => ordMap.set(p.problem_id, p.ord));
  out.sort((a, b) => {
    const oa = ordMap.get(a.problemId) ?? 9999;
    const ob = ordMap.get(b.problemId) ?? 9999;
    if (oa !== ob) return oa - ob;
    return a.refType === b.refType ? 0 : a.refType === "choice" ? -1 : 1;
  });

  return out;
}

// feat-2-022 ⑨ — 특정 ref(choice/box_item) id 들로 OX 지문 빌드. OX SRS 복습 러너(/study/srs/ox)용.
// getOxQuestionsForPack 과 동일 투영(ox_ineligible=false · ox_truth not null · 삭제 문제 제외).
export async function getOxQuestionsForRefs(
  client: SupabaseClient<Database>,
  choiceIds: string[],
  boxItemIds: string[],
): Promise<OxQuestionItem[]> {
  const out: OxQuestionItem[] = [];
  if (choiceIds.length > 0) {
    const { data: choiceRows } = await client
      .from("problem_choices")
      .select(
        "choice_id, problem_id, body_md, ox_body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
      )
      .in("choice_id", choiceIds)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    for (const r of choiceRows ?? []) {
      if (r.problems.deleted_at) continue;
      out.push({
        refType: "choice",
        refId: r.choice_id,
        problemId: r.problem_id,
        bodyMd: r.ox_body_md ?? r.body_md,
        oxTruth: r.ox_truth as OxTruth,
        explanationMd: r.explanation_md,
        year: r.problems.year,
        problemNumber: r.problems.problem_number,
        origin: r.problems.origin,
      });
    }
  }
  if (boxItemIds.length > 0) {
    const { data: boxRows } = await client
      .from("problem_box_items")
      .select(
        "box_item_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
      )
      .in("box_item_id", boxItemIds)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    for (const r of boxRows ?? []) {
      if (r.problems.deleted_at) continue;
      out.push({
        refType: "box",
        refId: r.box_item_id,
        problemId: r.problem_id,
        bodyMd: r.body_md,
        oxTruth: r.ox_truth as OxTruth,
        explanationMd: r.explanation_md,
        year: r.problems.year,
        problemNumber: r.problems.problem_number,
        origin: r.problems.origin,
      });
    }
  }
  return out;
}

// 한 systematic 단원(node)의 OX 가능 지문 — /study/srs/ox?node= (단원 재드릴, due 무관).
// 노드 귀속 = problems.primary_node_id 직접 + primary_article_id→article_systematic_links 간접
// (computeOxDiagnosis 귀속 규칙 미러). eligibility(ox_truth/ineligible/deleted)는
// getOxQuestionsForRefs 가 적용하므로 후보 ref 만 모아 넘긴다.
export async function getOxQuestionsForNode(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<OxQuestionItem[]> {
  const problemIds = new Set<string>();
  const { data: pinned } = await client
    .from("problems")
    .select("problem_id")
    .eq("primary_node_id", nodeId)
    .is("deleted_at", null);
  for (const p of pinned ?? []) problemIds.add(p.problem_id);

  const { data: links } = await client
    .from("article_systematic_links")
    .select("article_id")
    .eq("node_id", nodeId);
  const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
  if (articleIds.length > 0) {
    const { data: viaArticle } = await client
      .from("problems")
      .select("problem_id")
      .in("primary_article_id", articleIds)
      .is("deleted_at", null);
    for (const p of viaArticle ?? []) problemIds.add(p.problem_id);
  }
  if (problemIds.size === 0) return [];

  const pids = [...problemIds];
  const [choicesRes, boxesRes] = await Promise.all([
    client.from("problem_choices").select("choice_id").in("problem_id", pids),
    client
      .from("problem_box_items")
      .select("box_item_id")
      .in("problem_id", pids),
  ]);
  const choiceIds = (choicesRes.data ?? []).map((c) => c.choice_id);
  const boxItemIds = (boxesRes.data ?? []).map((b) => b.box_item_id);
  if (choiceIds.length === 0 && boxItemIds.length === 0) return [];
  return getOxQuestionsForRefs(client, choiceIds, boxItemIds);
}

// 과목 전체 OX 가능 지문 — /subjects/:subject/ox 풀이용. 셔플은 클라에서.
export async function getOxQuestionsForSubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  limit = 200,
  // 학생 = 승인 문제만(검토 게이트). staff = 초안 포함.
  opts?: { includeUnapproved?: boolean },
): Promise<OxQuestionItem[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  const out: OxQuestionItem[] = [];

  let choiceQuery = client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at, law_id)",
    )
    .eq("problems.law_id", law.law_id)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    // 삭제 문제 제외는 SQL 에서(루프 skip + limit 만으로는 staff 화면이 삭제 행에 굶는다).
    .is("problems.deleted_at", null);
  if (!opts?.includeUnapproved) {
    choiceQuery = choiceQuery.eq("problems.review_status", "approved");
  }
  const { data: choiceRows } = await choiceQuery.limit(limit);
  for (const r of choiceRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "choice",
      refId: r.choice_id,
      problemId: r.problem_id,
      bodyMd: r.ox_body_md ?? r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
    });
  }

  return out;
}

// "정오문제 불가" 문제 — 운영자가 ox_ineligible 로 체크해 OX 드릴(getOxQuestionsForSubject)에서
// 완전히 빠지는 문제(불가 항목 ≥1 ∧ OX-eligible 항목 0)를 problem_id 로 반환.
// 일반 객관식으로 모아 풀게 하는 런처(session-from-ox-ineligible)용.
// 후보 = 불가 플래그 있는 문제(적음) → 그중 eligible 항목(ox_truth 있고 불가 아님) 보유분 제외.
export async function getOxIneligibleProblemIds(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  opts?: { includeUnapproved?: boolean },
): Promise<string[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  // 1) "정오문제 불가" 체크된 항목이 있는 문제 후보(choices + box_items).
  const candidates = new Set<string>();
  for (const table of ["problem_choices", "problem_box_items"] as const) {
    let q = client
      .from(table)
      .select("problem_id, problems!inner(law_id, deleted_at, review_status)")
      .eq("problems.law_id", law.law_id)
      .eq("ox_ineligible", true)
      .is("problems.deleted_at", null);
    if (!opts?.includeUnapproved) {
      q = q.eq("problems.review_status", "approved");
    }
    const { data } = await q.limit(2000);
    for (const r of data ?? []) candidates.add(r.problem_id);
  }
  if (candidates.size === 0) return [];

  // 2) 후보 중 OX-eligible 항목(ox_truth not null ∧ 불가 아님)이 하나라도 있으면 제외
  //    (그런 문제는 OX 드릴에 일부 나오므로 "완전히 빠지는" 대상이 아님).
  const ids = [...candidates];
  const hasEligible = new Set<string>();
  for (const table of ["problem_choices", "problem_box_items"] as const) {
    const { data } = await client
      .from(table)
      .select("problem_id")
      .in("problem_id", ids)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    for (const r of data ?? []) hasEligible.add(r.problem_id);
  }
  return ids.filter((id) => !hasEligible.has(id));
}

export async function getOxQuestionsForArticle(
  client: SupabaseClient<Database>,
  articleId: string,
  limit = 50,
  // feat-4-A-341 — 체계도 노드 컨텍스트. 주면 지문을 부모 문제의 primary_node_id 로
  // 정밀 배치(지문 related_article = 문제 primary_article 인 경우만). 없으면 조문 단위.
  // includeUnapproved: 학생=false(승인 문제만, 검토 게이트) / staff=true(초안 포함).
  opts?: { nodeSubtreeIds?: readonly string[]; includeUnapproved?: boolean },
): Promise<OxQuestionItem[]> {
  const out: OxQuestionItem[] = [];
  const subtree = opts?.nodeSubtreeIds ?? null;
  const includeUnapproved = opts?.includeUnapproved ?? false;
  // 노드 컨텍스트일 때, 이 지문이 현재 노드에 배치되는지.
  const placed = (
    relatedNodeId: string | null,
    problemPrimaryArticleId: string | null,
    problemPrimaryNodeId: string | null,
  ): boolean => {
    if (!subtree) return true;
    // feat-4-A-342 — 1) 지문 자체 소분류(related_node_id) 명시 시 그걸로.
    if (relatedNodeId != null) return subtree.includes(relatedNodeId);
    // 2) 없으면 부모 문제 배치 상속(feat-4-A-341).
    if (problemPrimaryArticleId !== articleId) return true; // 교차참조 지문 → 조문 단위 유지
    if (problemPrimaryNodeId == null) return true; // 미태깅 → scatter(현행)
    return subtree.includes(problemPrimaryNodeId);
  };

  // ★ 적격 OX 는 페이지네이션으로 전량 수집한다. 예전엔 .limit(50) 로 정렬 없이 임의 50개만
  //   가져와, 한 조문에 OX 가 많으면(특허 제29조 233+개) 예상문제(origin=expected) 등 일부
  //   origin 이 통째로 잘려 패널에 안 뜨던 버그. 표시 컷(limit)은 정렬 후에만 적용한다.
  const PAGE = 1000;
  const buildChoiceQuery = () => {
    let q = client
      .from("problem_choices")
      .select(
        "choice_id, problem_id, body_md, ox_body_md, ox_truth, explanation_md, related_node_id, ox_hidden_at, problems!inner(year, problem_number, origin, review_status, deleted_at, primary_article_id, primary_node_id)",
      )
      .eq("related_article_id", articleId)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null)
      // 삭제된 문제 제외를 SQL 에서(staff RLS 는 deleted 도 읽으므로 루프 skip 만으론 부족).
      .is("problems.deleted_at", null);
    if (!includeUnapproved) {
      q = q.eq("problems.review_status", "approved");
      // 학생: 스태프가 숨긴 OX 비노출. 스태프(includeUnapproved)는 숨김 표시로 보임.
      q = q.is("ox_hidden_at", null);
    }
    return q;
  };
  // 1. problem_choices — 전량 페이지 수집(choice_id 안정 정렬).
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildChoiceQuery()
      .order("choice_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const r of batch) {
      if (r.problems.deleted_at) continue;
      if (
        !placed(
          r.related_node_id,
          r.problems.primary_article_id,
          r.problems.primary_node_id,
        )
      )
        continue;
      out.push({
        refType: "choice",
        refId: r.choice_id,
        problemId: r.problem_id,
        bodyMd: r.ox_body_md ?? r.body_md,
        oxTruth: r.ox_truth as OxTruth,
        explanationMd: r.explanation_md,
        year: r.problems.year,
        problemNumber: r.problems.problem_number,
        origin: r.problems.origin,
        reviewStatus: r.problems.review_status,
        oxHidden: r.ox_hidden_at != null,
      });
    }
    if (batch.length < PAGE) break;
  }

  // 2. problem_box_items (박스형 사례 지문) — choices 와 동일하게 전량 페이지 수집.
  const buildBoxQuery = () => {
    let q = client
      .from("problem_box_items")
      .select(
        "box_item_id, problem_id, body_md, ox_truth, explanation_md, related_node_id, ox_hidden_at, problems!inner(year, problem_number, origin, review_status, deleted_at, primary_article_id, primary_node_id)",
      )
      .eq("related_article_id", articleId)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null)
      .is("problems.deleted_at", null);
    if (!includeUnapproved) {
      q = q.eq("problems.review_status", "approved");
      q = q.is("ox_hidden_at", null);
    }
    return q;
  };
  const boxRows: NonNullable<
    Awaited<ReturnType<typeof buildBoxQuery>>["data"]
  > = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildBoxQuery()
      .order("box_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    boxRows.push(...batch);
    if (batch.length < PAGE) break;
  }
  for (const r of boxRows) {
    if (r.problems.deleted_at) continue;
    if (
      !placed(
        r.related_node_id,
        r.problems.primary_article_id,
        r.problems.primary_node_id,
      )
    )
      continue;
    out.push({
      refType: "box",
      refId: r.box_item_id,
      problemId: r.problem_id,
      // 정오문제 패널은 지문 하나를 단독 O/X 로 묻는다 → 박스 식별자([㉠] 등)는 노이즈라
      // 붙이지 않는다(원래 marker prefix 를 제거; OxQuestionsPanel 의 stripLeadingMarker 와도 정합).
      bodyMd: r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
      reviewStatus: r.problems.review_status,
      oxHidden: r.ox_hidden_at != null,
    });
  }

  // feat-4-A-343 — 표시 중복 제거: 같은 조문에 같은 지문(정규화)이 여러 문제에서 와
  // 패널에 여러 번 뜨던 것을 대표 1개로 합친다(모순 그룹은 가드로 노출 유지).
  const deduped = dedupeOxByBody(out);
  // 정렬: 연도 DESC, 문항 ASC. 같은 연도 내에서는 안정적 순서로.
  deduped.sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya !== yb) return yb - ya;
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });

  return deduped.slice(0, limit);
}

// OX 패널에서 사용자가 정답 확인 후 코멘트/즐겨찾기를 달 수 있게,
// 각 OX ref(choice/box-item) 별 코멘트(content_comments) / bookmark 를 한 번에 fetch 해서
// refId 키로 반환. 정오문제 = 지문 전체 대상 → 포스트잇(문구 앵커)이 아니라 코멘트.
// 코멘트 가시성(강사 공개 / 학생 본인)은 content_comments RLS 가 경계.
export async function getOxAnnotationsForRefs(
  client: SupabaseClient<Database>,
  userId: string,
  items: OxQuestionItem[],
): Promise<Record<string, OxRefAnnotations>> {
  if (items.length === 0) return {};
  const choiceIds: string[] = [];
  const boxIds: string[] = [];
  for (const it of items) {
    if (it.refType === "choice") choiceIds.push(it.refId);
    else if (it.refType === "box") boxIds.push(it.refId);
  }

  const [choiceComments, choiceBookmarks, boxComments, boxBookmarks, hiddenSet] =
    await Promise.all([
      listCommentsBulk(client, "problem_choice", choiceIds),
      getBookmarksByTargets(client, userId, "problem_choice", choiceIds),
      listCommentsBulk(client, "problem_box_item", boxIds),
      getBookmarksByTargets(client, userId, "problem_box_item", boxIds),
      getUserHiddenOxRefs(client, userId, choiceIds, boxIds),
    ]);

  const out: Record<string, OxRefAnnotations> = {};
  for (const it of items) {
    const targetType =
      it.refType === "choice" ? "problem_choice" : "problem_box_item";
    const comments = it.refType === "choice" ? choiceComments : boxComments;
    const bookmarks = it.refType === "choice" ? choiceBookmarks : boxBookmarks;
    out[it.refId] = {
      comments: comments[it.refId] ?? [],
      bookmark: bookmarks[it.refId] ?? null,
      userHidden: hiddenSet.has(`${targetType}:${it.refId}`),
    };
  }
  return out;
}

// 학생 개인 숨김(user_ox_hidden) 조회 — "<target_type>:<target_id>" 집합으로 반환.
async function getUserHiddenOxRefs(
  client: SupabaseClient<Database>,
  userId: string,
  choiceIds: string[],
  boxIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (choiceIds.length === 0 && boxIds.length === 0) return set;
  const { data, error } = await client
    .from("user_ox_hidden")
    .select("target_type, target_id")
    .eq("user_id", userId);
  if (error) throw error;
  const choiceSet = new Set(choiceIds);
  const boxSet = new Set(boxIds);
  for (const r of data ?? []) {
    if (r.target_type === "problem_choice" && choiceSet.has(r.target_id))
      set.add(`problem_choice:${r.target_id}`);
    else if (r.target_type === "problem_box_item" && boxSet.has(r.target_id))
      set.add(`problem_box_item:${r.target_id}`);
  }
  return set;
}

// 해설 — 지문별 "관련 조문 / 관련 판례" 링크 노출용. choice·box-item 들이 가리키는
// article/case ID 를 bulk lookup → article path + display label / case 번호 + 제목.
export interface ChoiceLinkRefs {
  articles: Map<
    string,
    {
      articleId: string;
      lawCode: string;
      pathSlug: string;
      displayLabel: string;
    }
  >;
  cases: Map<
    string,
    { caseId: string; lawCode: string; caseNumber: string; caseTitle: string }
  >;
}

export async function getChoiceLinkRefs(
  client: SupabaseClient<Database>,
  articleIds: string[],
  caseIds: string[],
): Promise<ChoiceLinkRefs> {
  const articleMap = new Map<
    string,
    {
      articleId: string;
      lawCode: string;
      pathSlug: string;
      displayLabel: string;
    }
  >();
  const caseMap = new Map<
    string,
    { caseId: string; lawCode: string; caseNumber: string; caseTitle: string }
  >();

  if (articleIds.length > 0) {
    const unique = Array.from(new Set(articleIds));
    const { data: rows } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", unique);
    for (const r of rows ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        articleId: r.article_id,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
        displayLabel: r.display_label,
      });
    }
  }

  if (caseIds.length > 0) {
    const unique = Array.from(new Set(caseIds));
    const { data: rows } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", unique)
      .is("deleted_at", null);
    for (const r of rows ?? []) {
      caseMap.set(r.case_id, {
        caseId: r.case_id,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
        caseNumber: r.case_number,
        caseTitle: r.case_title,
      });
    }
  }

  return { articles: articleMap, cases: caseMap };
}

// 같은 primary_article 의 다른 문제 — problem-viewer 우측 "유사 문제" 탭.
export interface RelatedProblemItem {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  bodySnippet: string;
  format: string;
  origin: string;
  lawCode: string;
  // case-viewer 의 유사문제에서만 의미 — true 면 problem_case_links 직접 인용.
  isCited?: boolean;
}

export async function getRelatedProblems(
  client: SupabaseClient<Database>,
  problemId: string,
  limit = 8,
): Promise<RelatedProblemItem[]> {
  // 1. self problem 의 primary_article_id, law_id 조회.
  const { data: self } = await client
    .from("problems")
    .select("primary_article_id, law_id")
    .eq("problem_id", problemId)
    .maybeSingle();
  if (!self?.primary_article_id) return [];

  // 2. 같은 article 다른 문제 (deleted 제외, 자기 자신 제외).
  const { data: rows, error } = await client
    .from("problems")
    .select(
      "problem_id, year, problem_number, body_md, format, origin, laws!inner(law_code)",
    )
    .eq("primary_article_id", self.primary_article_id)
    .neq("problem_id", problemId)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (rows ?? []).map((r) => ({
    problemId: r.problem_id,
    year: r.year,
    problemNumber: r.problem_number,
    bodySnippet:
      (r.body_md ?? "").length > 100
        ? `${(r.body_md ?? "").slice(0, 100)}…`
        : (r.body_md ?? ""),
    format: r.format,
    origin: r.origin,
    lawCode: r.laws.law_code,
  }));
}

// article-viewer "이 조문 연결" 배지 → 우측 "유사 문제" 탭용.
// 이 조문(primary_article_id)이 일차 분류된 문제(승인분·미삭제)를 최신 기출순으로.
// 학생 draft 누수 방지로 review_status=approved 강제(problems RLS 는 draft 안 가림).
export async function getRelatedProblemsByArticle(
  client: SupabaseClient<Database>,
  articleId: string,
  limit = 12,
): Promise<RelatedProblemItem[]> {
  const { data: rows, error } = await client
    .from("problems")
    .select(
      "problem_id, year, problem_number, body_md, format, origin, laws!inner(law_code)",
    )
    .eq("primary_article_id", articleId)
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (rows ?? []).map((r) => ({
    problemId: r.problem_id,
    year: r.year,
    problemNumber: r.problem_number,
    bodySnippet:
      (r.body_md ?? "").length > 100
        ? `${(r.body_md ?? "").slice(0, 100)}…`
        : (r.body_md ?? ""),
    format: r.format,
    origin: r.origin,
    lawCode: r.laws.law_code,
  }));
}

// 체계도 노드 미니그래프 / 진척도용 — 여러 article 의 primary 문제 일괄 조회.
// 한 article 당 여러 문제 가능. 반환: articleId → 문제 목록.
export async function listProblemsByArticleIds(
  client: SupabaseClient<Database>,
  articleIds: string[],
  limitPerArticle = 30,
): Promise<
  Record<
    string,
    {
      problemId: string;
      year: number | null;
      problemNumber: number | null;
      format: string;
      origin: string;
    }[]
  >
> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("problems")
    .select(
      "problem_id, primary_article_id, year, problem_number, format, origin",
    )
    .in("primary_article_id", articleIds)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true });
  if (error) throw error;
  const result: Record<
    string,
    {
      problemId: string;
      year: number | null;
      problemNumber: number | null;
      format: string;
      origin: string;
    }[]
  > = {};
  for (const aid of articleIds) result[aid] = [];
  for (const r of data ?? []) {
    if (!r.primary_article_id) continue;
    const arr = result[r.primary_article_id];
    if (!arr || arr.length >= limitPerArticle) continue;
    arr.push({
      problemId: r.problem_id,
      year: r.year,
      problemNumber: r.problem_number,
      format: r.format,
      origin: r.origin,
    });
  }
  return result;
}

// case 의 관련 조문(article_case_links) 들이 primary_article_id 인 문제 — 입체 학습용.
// case-viewer 우측 패널 "유사 문제" 탭에서 노출.
// 직접 인용(problem_case_links)이 있으면 그 문제들이 isCited=true 로 먼저 정렬.
export async function getRelatedProblemsByCase(
  client: SupabaseClient<Database>,
  caseId: string,
  limit = 8,
): Promise<RelatedProblemItem[]> {
  // (a) 직접 인용 — problem_case_links.
  const { data: directRows } = await client
    .from("problem_case_links")
    .select(
      "relation_type, problems!inner(problem_id, year, problem_number, body_md, format, origin, deleted_at, laws!inner(law_code))",
    )
    .eq("case_id", caseId);
  const directProblems: RelatedProblemItem[] = [];
  const directIds = new Set<string>();
  for (const r of directRows ?? []) {
    const p = r.problems;
    if (!p || p.deleted_at) continue;
    if (directIds.has(p.problem_id)) continue;
    directIds.add(p.problem_id);
    directProblems.push({
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      bodySnippet:
        (p.body_md ?? "").length > 100
          ? `${(p.body_md ?? "").slice(0, 100)}…`
          : (p.body_md ?? ""),
      format: p.format,
      origin: p.origin,
      lawCode: p.laws.law_code,
      isCited: true,
    });
  }
  directProblems.sort((a, b) => {
    if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });

  // (b) 관련 조문 우회.
  let viaArticleProblems: RelatedProblemItem[] = [];
  if (directProblems.length < limit) {
    const { data: linkRows } = await client
      .from("article_case_links")
      .select("article_id")
      .eq("case_id", caseId);
    const articleIds = Array.from(
      new Set((linkRows ?? []).map((r) => r.article_id).filter(Boolean)),
    );
    if (articleIds.length > 0) {
      const { data: rows, error } = await client
        .from("problems")
        .select(
          "problem_id, year, problem_number, body_md, format, origin, laws!inner(law_code)",
        )
        .in("primary_article_id", articleIds)
        .is("deleted_at", null)
        .order("year", { ascending: false, nullsFirst: false })
        .order("problem_number", { ascending: true })
        .limit(limit + directIds.size);
      if (error) throw error;
      viaArticleProblems = (rows ?? [])
        .filter((r) => !directIds.has(r.problem_id))
        .map((r) => ({
          problemId: r.problem_id,
          year: r.year,
          problemNumber: r.problem_number,
          bodySnippet:
            (r.body_md ?? "").length > 100
              ? `${(r.body_md ?? "").slice(0, 100)}…`
              : (r.body_md ?? ""),
          format: r.format,
          origin: r.origin,
          lawCode: r.laws.law_code,
          isCited: false,
        }));
    }
  }

  return [...directProblems, ...viaArticleProblems].slice(0, limit);
}

// 이 판례가 출제된 1차 객관식 기출문제 — problem_case_links 기반 (feat-8-024).
// case-viewer 헤더의 기출문제 칩. ExamProblemRef 타입은 ./labels 소유.
export async function getExamProblemsForCase(
  client: SupabaseClient<Database>,
  caseId: string,
): Promise<ExamProblemRef[]> {
  const { data, error } = await client
    .from("problem_case_links")
    .select(
      "problems!inner(problem_id, year, problem_number, origin, exam_round, format, deleted_at, laws!inner(law_code))",
    )
    .eq("case_id", caseId);
  if (error) throw error;
  const out: ExamProblemRef[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const p = r.problems;
    if (!p || p.deleted_at) continue;
    // 객관식 1차 기출(변형 포함) — 변형만 연결된 연도가 칩에서 빠지지 않게.
    if (p.origin !== "past_exam" && p.origin !== "past_exam_variant") continue;
    if (p.exam_round !== "first") continue;
    if (!MC_FORMATS.includes(p.format)) continue;
    if (seen.has(p.problem_id)) continue;
    seen.add(p.problem_id);
    out.push({
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      lawCode: p.laws.law_code,
      isVariant: p.origin === "past_exam_variant",
    });
  }
  // 연도 내림차순 · 같은 연도면 원본 기출 우선(변형 뒤) · 번호 오름차순 —
  // mergeFirstRoundChips 의 연도당 첫 problem dedup 이 원본을 잡게 한다.
  out.sort((a, b) => {
    if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
    if ((a.isVariant ? 1 : 0) !== (b.isVariant ? 1 : 0))
      return (a.isVariant ? 1 : 0) - (b.isVariant ? 1 : 0);
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });
  return out;
}

// problem_case_links 로 각 판례가 출제된 1차 객관식 기출문제 (feat-8-024).
// 판례 목록의 1차 기출 칩·"1차 기출" 필터에 사용 — case_id → 기출문제 참조 배열
// (연도·문항번호 포함, ExamProblemChip 으로 해당 문제 뷰어 이동).
export async function getExamProblemsByCase(
  client: SupabaseClient<Database>,
): Promise<Map<string, ExamProblemRef[]>> {
  const { data, error } = await client
    .from("problem_case_links")
    .select(
      "case_id, problems!inner(problem_id, year, problem_number, origin, exam_round, format, deleted_at, laws!inner(law_code))",
    );
  if (error) throw error;
  const byCase = new Map<string, ExamProblemRef[]>();
  const seen = new Set<string>(); // `${caseId}::${problemId}` — 중복 링크 제거.
  for (const r of data ?? []) {
    const p = r.problems;
    if (!p || p.deleted_at) continue;
    // 객관식 1차 기출(변형 포함) — 변형만 연결된 연도가 칩에서 빠지지 않게.
    if (p.origin !== "past_exam" && p.origin !== "past_exam_variant") continue;
    if (p.exam_round !== "first") continue;
    if (!MC_FORMATS.includes(p.format)) continue;
    const key = `${r.case_id}::${p.problem_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byCase.get(r.case_id) ?? [];
    list.push({
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      lawCode: p.laws.law_code,
      isVariant: p.origin === "past_exam_variant",
    });
    byCase.set(r.case_id, list);
  }
  // 칩 표시 순서 — 연도 오름차순 · 같은 연도면 원본 기출 우선(변형 뒤) · 문항번호 오름차순.
  for (const list of byCase.values()) {
    list.sort((a, b) => {
      if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
      if ((a.isVariant ? 1 : 0) !== (b.isVariant ? 1 : 0))
        return (a.isVariant ? 1 : 0) - (b.isVariant ? 1 : 0);
      return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
    });
  }
  return byCase;
}

// 수동 매칭 화면(feat-8-024) — 한 과목의 1차 객관식 기출문제 목록.
// 발문·선택지·박스 항목 전체 지문을 함께 반환해 운영자가 지문을 읽고 판례를
// 매칭할 수 있게 한다. ExamCaseLink* 타입은 labels.ts 소유.
export async function listExamCaseLinkRows(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<ExamCaseLinkRow[]> {
  const { data: probs, error } = await client
    .from("problems")
    .select(
      "problem_id, year, problem_number, body_md, format, laws!inner(law_code)",
    )
    .eq("origin", "past_exam")
    .eq("exam_round", "first")
    .in("format", [...MC_FORMATS])
    .eq("laws.law_code", lawCode)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true });
  if (error) throw error;
  const problems = probs ?? [];
  if (problems.length === 0) return [];
  const problemIds = problems.map((p) => p.problem_id);

  // 연결 판례 · 선택지 · 박스 항목을 병렬 조회.
  const [{ data: linkRows }, { data: choiceRows }, { data: boxRows }] =
    await Promise.all([
      client
        .from("problem_case_links")
        .select(
          "link_id, problem_id, case_id, note, cases!inner(case_number, case_title, deleted_at)",
        )
        .in("problem_id", problemIds),
      client
        .from("problem_choices")
        .select(
          "problem_id, choice_id, choice_index, body_md, explanation_md, choice_type, related_case_number",
        )
        .in("problem_id", problemIds)
        .order("choice_index"),
      client
        .from("problem_box_items")
        .select(
          "problem_id, box_item_id, position_index, marker, body_md, explanation_md, choice_type, related_case_number",
        )
        .in("problem_id", problemIds)
        .order("position_index"),
    ]);

  const linksByProblem = new Map<string, ExamCaseLink[]>();
  for (const lr of linkRows ?? []) {
    const c = lr.cases;
    if (!c || c.deleted_at) continue;
    const list = linksByProblem.get(lr.problem_id) ?? [];
    list.push({
      linkId: lr.link_id,
      caseId: lr.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      isAuto: lr.note === "exam-scan",
    });
    linksByProblem.set(lr.problem_id, list);
  }

  const choicesByProblem = new Map<string, ExamCaseSegment[]>();
  for (const cr of choiceRows ?? []) {
    const list = choicesByProblem.get(cr.problem_id) ?? [];
    list.push({
      segmentId: cr.choice_id,
      segmentKind: "choice",
      label: String(cr.choice_index),
      bodyMd: cr.body_md,
      explanationMd: cr.explanation_md,
      choiceType: cr.choice_type,
      relatedCaseNumber: cr.related_case_number,
    });
    choicesByProblem.set(cr.problem_id, list);
  }

  const boxByProblem = new Map<string, ExamCaseSegment[]>();
  for (const br of boxRows ?? []) {
    const list = boxByProblem.get(br.problem_id) ?? [];
    list.push({
      segmentId: br.box_item_id,
      segmentKind: "box",
      label: br.marker,
      bodyMd: br.body_md,
      explanationMd: br.explanation_md,
      choiceType: br.choice_type,
      relatedCaseNumber: br.related_case_number,
    });
    boxByProblem.set(br.problem_id, list);
  }

  const rows: ExamCaseLinkRow[] = problems.map((p) => ({
    problemId: p.problem_id,
    year: p.year,
    problemNumber: p.problem_number,
    lawCode: p.laws.law_code,
    format: p.format,
    bodyMd: p.body_md ?? "",
    boxItems: boxByProblem.get(p.problem_id) ?? [],
    choices: choicesByProblem.get(p.problem_id) ?? [],
    links: linksByProblem.get(p.problem_id) ?? [],
  }));

  // 판례형 지문(choice_type='precedent')인 선택지·박스 항목이 하나라도 있는
  // 문제만 매칭 대상. 판례 출제 지문이 없으면 연결할 판례가 없으므로 목록에서
  // 제외한다 (feat-8-024). 단, 이미 판례 링크가 걸린 문제는 해제·검토가
  // 가능하도록 유지한다.
  return rows.filter(
    (r) =>
      r.links.length > 0 ||
      r.choices.some((s) => s.choiceType === "precedent") ||
      r.boxItems.some((s) => s.choiceType === "precedent"),
  );
}

// problem-viewer 우측 패널 — 이 문제가 인용한 판례.
export interface CitedCaseItem {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  summaryTitle: string | null;
  decidedAt: string;
  importance: number;
  lawCode: string;
  relationType: string;
}

export async function getCasesCitedByProblem(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<CitedCaseItem[]> {
  const { data, error } = await client
    .from("problem_case_links")
    .select(
      "relation_type, cases!inner(case_id, case_number, case_title, summary_title, decided_at, importance, subject_laws, deleted_at)",
    )
    .eq("problem_id", problemId);
  if (error) throw error;
  const out: CitedCaseItem[] = [];
  for (const r of data ?? []) {
    const c = r.cases;
    if (!c || c.deleted_at) continue;
    out.push({
      caseId: c.case_id,
      caseNumber: c.case_number,
      caseTitle: c.case_title,
      summaryTitle: c.summary_title,
      decidedAt: c.decided_at,
      importance: c.importance ?? 1,
      lawCode: (c.subject_laws as string[] | null)?.[0] ?? "patent",
      relationType: r.relation_type,
    });
  }
  out.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  return out;
}

export async function getProblemById(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemDetail | null> {
  const { data: problem, error } = await client
    .from("problems")
    .select(
      "problem_id, display_no, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, exam_number, body_md, importance, primary_article_id, law_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, rubric_ai_generated_at, rubric_reviewed_at, main_case_number, total_points, articles!primary_article_id(article_number, display_label)",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!problem) return null;

  const { data: choices, error: cErr } = await client
    .from("problem_choices")
    .select(
      "choice_id, choice_index, body_md, is_correct, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, related_node_id, ox_ineligible, ox_truth",
    )
    .eq("problem_id", problemId)
    .order("choice_index");
  if (cErr) throw cErr;
  const choiceList = choices ?? [];

  const { data: boxRows } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, position_index, marker, body_md, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, related_node_id, ox_ineligible, ox_truth",
    )
    .eq("problem_id", problemId)
    .order("position_index");
  const boxList = boxRows ?? [];

  return {
    problemId: problem.problem_id,
    displayNo: problem.display_no,
    examRound: problem.exam_round,
    format: problem.format,
    origin: problem.origin,
    polarity: problem.polarity,
    scope: problem.scope,
    year: problem.year,
    examRoundNo: problem.exam_round_no,
    problemNumber: problem.problem_number,
    examNumber: problem.exam_number,
    bodyMd: problem.body_md,
    importance: problem.importance ?? 0,
    primaryArticleId: problem.primary_article_id,
    primaryArticleNumber: problem.articles?.article_number ?? null,
    primaryArticleLabel: problem.articles?.display_label ?? null,
    unclassifiedChoices:
      problem.format === "mc_box"
        ? 0
        : choiceList.filter((c) => c.choice_type === null).length,
    reviewedAt: problem.reviewed_at,
    mismatchFlaggedAt: problem.mismatch_flagged_at,
    explanationMd: problem.explanation_md,
    modelAnswerMd: problem.model_answer_md,
    gradingRubricMd: problem.grading_rubric_md,
    videoUrl: problem.video_url,
    subjectiveKind: problem.subjective_kind,
    subjectiveKeywords: problem.subjective_keywords,
    subjectiveTopic: problem.subjective_topic,
    rubricItems: parseRubricItems(problem.rubric_items),
    rubricAiGeneratedAt: problem.rubric_ai_generated_at,
    rubricReviewedAt: problem.rubric_reviewed_at,
    mainCaseNumber: problem.main_case_number,
    totalPoints: problem.total_points,
    hasTable:
      hasTableMd(problem.explanation_md) ||
      choiceList.some((c) => hasTableMd(c.explanation_md)) ||
      boxList.some((b) => hasTableMd(b.explanation_md)),
    hasImage:
      hasImageMd(problem.explanation_md) ||
      choiceList.some((c) => hasImageMd(c.explanation_md)) ||
      boxList.some((b) => hasImageMd(b.explanation_md)),
    choices: choiceList.map((c) => ({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
      choiceType: c.choice_type,
      relatedArticleId: c.related_article_id,
      relatedArticleNumber: c.related_article_number,
      relatedCaseId: c.related_case_id,
      relatedCaseNumber: c.related_case_number,
      relatedNodeId: c.related_node_id,
      oxIneligible: c.ox_ineligible,
      oxTruth: c.ox_truth,
    })),
    boxItems: boxList.map((b) => ({
      boxItemId: b.box_item_id,
      positionIndex: b.position_index,
      marker: b.marker,
      bodyMd: b.body_md,
      explanationMd: b.explanation_md,
      choiceType: b.choice_type,
      relatedArticleId: b.related_article_id,
      relatedArticleNumber: b.related_article_number,
      relatedCaseId: b.related_case_id,
      relatedCaseNumber: b.related_case_number,
      relatedNodeId: b.related_node_id,
      oxIneligible: b.ox_ineligible,
      oxTruth: b.ox_truth,
    })),
  };
}

// 여러 문제를 한 번에 ProblemDetail 형태로 — MCQ 팩 시험지 view 등에서 사용.
// session.problemIds 순서를 유지해 반환한다. 누락된 문제는 결과에서 제외.
export async function getProblemDetailsByIds(
  client: SupabaseClient<Database>,
  problemIds: string[],
): Promise<ProblemDetail[]> {
  if (problemIds.length === 0) return [];
  const { data: problemRows, error } = await client
    .from("problems")
    .select(
      "problem_id, display_no, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, rubric_ai_generated_at, rubric_reviewed_at, main_case_number, total_points, articles!primary_article_id(article_number, display_label)",
    )
    .in("problem_id", problemIds)
    .is("deleted_at", null);
  if (error) throw error;
  const problemList = problemRows ?? [];
  if (problemList.length === 0) return [];

  const boxItemsByProblem = new Map<string, ProblemDetail["boxItems"]>();
  const { data: boxRows } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, position_index, marker, body_md, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
    )
    .in("problem_id", problemIds)
    .order("position_index");
  for (const b of boxRows ?? []) {
    const arr = boxItemsByProblem.get(b.problem_id) ?? [];
    arr.push({
      boxItemId: b.box_item_id,
      positionIndex: b.position_index,
      marker: b.marker,
      bodyMd: b.body_md,
      explanationMd: b.explanation_md,
      choiceType: b.choice_type,
      relatedArticleId: b.related_article_id,
      relatedArticleNumber: b.related_article_number,
      relatedCaseId: b.related_case_id,
      relatedCaseNumber: b.related_case_number,
      oxIneligible: b.ox_ineligible,
      oxTruth: b.ox_truth,
    });
    boxItemsByProblem.set(b.problem_id, arr);
  }

  const choicesByProblem = new Map<string, ProblemDetail["choices"]>();
  const { data: choiceRows } = await client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, choice_index, body_md, is_correct, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
    )
    .in("problem_id", problemIds)
    .order("choice_index");
  for (const c of choiceRows ?? []) {
    const arr = choicesByProblem.get(c.problem_id) ?? [];
    arr.push({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
      choiceType: c.choice_type,
      relatedArticleId: c.related_article_id,
      relatedArticleNumber: c.related_article_number,
      relatedCaseId: c.related_case_id,
      relatedCaseNumber: c.related_case_number,
      oxIneligible: c.ox_ineligible,
      oxTruth: c.ox_truth,
    });
    choicesByProblem.set(c.problem_id, arr);
  }

  const byId = new Map<string, ProblemDetail>();
  for (const p of problemList) {
    const choices = choicesByProblem.get(p.problem_id) ?? [];
    const boxItems = boxItemsByProblem.get(p.problem_id) ?? [];
    byId.set(p.problem_id, {
      problemId: p.problem_id,
      displayNo: p.display_no,
      examRound: p.exam_round,
      format: p.format,
      origin: p.origin,
      polarity: p.polarity,
      scope: p.scope,
      year: p.year,
      examRoundNo: p.exam_round_no,
      problemNumber: p.problem_number,
      bodyMd: p.body_md,
      importance: p.importance ?? 0,
      primaryArticleId: p.primary_article_id,
      primaryArticleNumber: p.articles?.article_number ?? null,
      primaryArticleLabel: p.articles?.display_label ?? null,
      unclassifiedChoices:
        p.format === "mc_box"
          ? 0
          : choices.filter((c) => c.choiceType === null).length,
      reviewedAt: p.reviewed_at,
      mismatchFlaggedAt: p.mismatch_flagged_at,
      explanationMd: p.explanation_md,
      modelAnswerMd: p.model_answer_md,
      gradingRubricMd: p.grading_rubric_md,
      videoUrl: p.video_url,
      subjectiveKind: p.subjective_kind,
      subjectiveKeywords: p.subjective_keywords,
      subjectiveTopic: p.subjective_topic,
      rubricItems: parseRubricItems(p.rubric_items),
      rubricAiGeneratedAt: p.rubric_ai_generated_at,
      rubricReviewedAt: p.rubric_reviewed_at,
      mainCaseNumber: p.main_case_number,
      totalPoints: p.total_points,
      hasTable:
        hasTableMd(p.explanation_md) ||
        choices.some((c) => hasTableMd(c.explanationMd)) ||
        boxItems.some((b) => hasTableMd(b.explanationMd)),
      hasImage:
        hasImageMd(p.explanation_md) ||
        choices.some((c) => hasImageMd(c.explanationMd)) ||
        boxItems.some((b) => hasImageMd(b.explanationMd)),
      choices,
      boxItems,
    });
  }
  // problemIds 순서 보존.
  return problemIds.flatMap((id) => {
    const detail = byId.get(id);
    return detail ? [detail] : [];
  });
}

// ──────── 체계도 기반 admin 화면용 헬퍼 ────────

export interface SystematicTopNode {
  nodeId: string;
  path: string;
  displayLabel: string;
  ord: number;
  problemCount: number;
}

// 체계도 최상위 노드 (예: "01 총칙/보칙", "02 특허요건", ...) + 노드별 문제 수.
// feat-4-A-340 — 노드 배치 우선순위. 한 노드 subtree 에 배치된 문제 행(중복 제거).
//   1) primary_node_id ∈ subtreeNodeIds  (정확 배치)
//   2) primary_node_id IS NULL AND primary_article_id ∈ articleIds  (조문 파생 fallback)
// year DESC, problem_number ASC 정렬해 반환.
interface PlacedProblemRow {
  problem_id: string;
  primary_article_id: string | null;
  primary_node_id: string | null;
  year: number | null;
  problem_number: number | null;
  importance: number | null;
}
async function fetchPlacedProblemRows(
  client: SupabaseClient<Database>,
  subtreeNodeIds: readonly string[],
  articleIds: readonly string[],
): Promise<PlacedProblemRow[]> {
  const SEL =
    "problem_id, primary_article_id, primary_node_id, year, problem_number, importance";
  const byId = new Map<string, PlacedProblemRow>();
  const pinned = await fetchAllIn(subtreeNodeIds, (slice) =>
    client
      .from("problems")
      .select(SEL)
      .in("primary_node_id", slice)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  for (const r of pinned) byId.set(r.problem_id, r);
  const derived = await fetchAllIn(articleIds, (slice) =>
    client
      .from("problems")
      .select(SEL)
      .in("primary_article_id", slice)
      .is("primary_node_id", null)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  for (const r of derived) byId.set(r.problem_id, r);
  return [...byId.values()].sort((x, y) => {
    if ((y.year ?? 0) !== (x.year ?? 0)) return (y.year ?? 0) - (x.year ?? 0);
    return (x.problem_number ?? 0) - (y.problem_number ?? 0);
  });
}

export async function listSystematicTopNodes(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<SystematicTopNode[]> {
  // RPC 가 없으니 SQL view 가 가장 깔끔하지만, 일단 manual 조립.
  const { data: nodes } = await client
    .from("systematic_nodes")
    .select("node_id, path, display_label, ord")
    .eq("law_code", lawCode)
    .order("ord", { ascending: true });
  if (!nodes) return [];
  // path string parse — depth(=nlevel)=2 인 항목만 (예: "patent.b1")
  const tops = nodes.filter((n) => String(n.path).split(".").length === 2);
  // 각 top 노드에 대해 — 그 subtree 의 모든 article_id 집계 후 problem 수 카운트.
  const result: SystematicTopNode[] = [];
  for (const top of tops) {
    const topPath = String(top.path);
    const subtreeNodeIds = nodes
      .filter(
        (n) =>
          String(n.path) === topPath ||
          String(n.path).startsWith(topPath + "."),
      )
      .map((n) => n.node_id);
    let articleIds: string[] = [];
    if (subtreeNodeIds.length > 0) {
      const links = await fetchAllIn(subtreeNodeIds, (slice) =>
        client
          .from("article_systematic_links")
          .select("article_id")
          .in("node_id", slice)
          .order("article_id"),
      );
      articleIds = [...new Set(links.map((l) => l.article_id))];
    }
    // feat-4-A-340 — node-pinned + 조문 파생 합산.
    const placed = await fetchPlacedProblemRows(
      client,
      subtreeNodeIds,
      articleIds,
    );
    result.push({
      nodeId: top.node_id,
      path: topPath,
      displayLabel: top.display_label,
      ord: top.ord,
      problemCount: placed.length,
    });
  }
  return result;
}

export interface SystematicNodeProblemsResult {
  node: { nodeId: string; path: string; displayLabel: string };
  // 조문 순서대로 정렬된 article 그룹 + 그 안의 문제들.
  articleGroups: Array<{
    articleId: string;
    articleNumber: string | null;
    articleLabel: string;
    articlePath: string;
    problems: ProblemDetail[];
  }>;
  // 노드에는 매핑됐지만 문제는 없는 article (이미지 트리에서 비어있다고 표시 가능)
  emptyArticles: Array<{
    articleId: string;
    articleNumber: string | null;
    articleLabel: string;
  }>;
}

// 노드 클릭 → 해당 노드 subtree 의 모든 article 을 조문 순서대로 + 문제까지 가져온다.
export async function getSystematicNodeProblems(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<SystematicNodeProblemsResult | null> {
  const { data: node } = await client
    .from("systematic_nodes")
    .select("node_id, path, display_label, law_code")
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!node) return null;

  // subtree 노드 전부.
  const { data: subtreeNodes } = await client
    .from("systematic_nodes")
    .select("node_id, path, parent_id, ord, display_label")
    .eq("law_code", node.law_code);
  const nodePath = String(node.path);
  const subtreeRows = (subtreeNodes ?? []).filter(
    (n) =>
      String(n.path) === nodePath || String(n.path).startsWith(nodePath + "."),
  );
  const subtreeIds = subtreeRows.map((n) => n.node_id);

  // subtree 에 매핑된 article_id 들.
  const links = await fetchAllIn(subtreeIds, (slice) =>
    client
      .from("article_systematic_links")
      .select("article_id")
      .in("node_id", slice)
      .order("article_id"),
  );
  const articleIds = [...new Set(links.map((l) => l.article_id))];
  // 조문 링크 0개여도 조기 반환 금지 — node-pinned 문제는 링크 없이도 존재한다(상표 객관식 등).

  // article 정보 (path/article_number/display_label) — 조문 순서로 정렬.
  const articles = await fetchAllIn(articleIds, (slice) =>
    client
      .from("articles")
      .select("article_id, article_number, display_label, path")
      .in("article_id", slice)
      .order("article_id"),
  );
  const sortedArticles = [...(articles ?? [])].sort((a, b) =>
    compareArticlePath(String(a.path), String(b.path)),
  );

  // feat-4-A-340 — node-pinned 우선 + 조문 파생으로 배치된 문제만 fetch.
  const placedRows = await fetchPlacedProblemRows(client, subtreeIds, articleIds);
  const placedIds = placedRows.map((p) => p.problem_id);
  const problemList = await fetchAllIn(placedIds, (slice) =>
    client
      .from("problems")
      .select(
        "problem_id, display_no, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, rubric_ai_generated_at, rubric_reviewed_at, main_case_number, total_points, articles!primary_article_id(article_number, display_label)",
      )
      .in("problem_id", slice)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  const problemIds = problemList.map((p) => p.problem_id);

  // 박스 항목 batch.
  const boxItemsByProblem = new Map<string, ProblemDetail["boxItems"]>();
  if (problemIds.length > 0) {
    const { data: boxRows } = await client
      .from("problem_box_items")
      .select(
        "box_item_id, problem_id, position_index, marker, body_md, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
      )
      .in("problem_id", problemIds)
      .order("position_index");
    for (const b of boxRows ?? []) {
      const arr = boxItemsByProblem.get(b.problem_id) ?? [];
      arr.push({
        boxItemId: b.box_item_id,
        positionIndex: b.position_index,
        marker: b.marker,
        bodyMd: b.body_md,
        explanationMd: b.explanation_md,
        choiceType: b.choice_type,
        relatedArticleId: b.related_article_id,
        relatedArticleNumber: b.related_article_number,
        relatedCaseId: b.related_case_id,
        relatedCaseNumber: b.related_case_number,
        oxIneligible: b.ox_ineligible,
        oxTruth: b.ox_truth,
      });
      boxItemsByProblem.set(b.problem_id, arr);
    }
  }

  // 모든 choice 한번에 fetch.
  const choicesByProblem = new Map<string, ProblemDetail["choices"]>();
  if (problemIds.length > 0) {
    const { data: choiceRows } = await client
      .from("problem_choices")
      .select(
        "choice_id, problem_id, choice_index, body_md, is_correct, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
      )
      .in("problem_id", problemIds)
      .order("choice_index");
    for (const c of choiceRows ?? []) {
      const arr = choicesByProblem.get(c.problem_id) ?? [];
      arr.push({
        choiceId: c.choice_id,
        choiceIndex: c.choice_index,
        bodyMd: c.body_md,
        isCorrect: c.is_correct,
        explanationMd: c.explanation_md,
        choiceType: c.choice_type,
        relatedArticleId: c.related_article_id,
        relatedArticleNumber: c.related_article_number,
        relatedCaseId: c.related_case_id,
        relatedCaseNumber: c.related_case_number,
        oxIneligible: c.ox_ineligible,
        oxTruth: c.ox_truth,
      });
      choicesByProblem.set(c.problem_id, arr);
    }
  }

  // article 별 그룹핑 + 문제 정렬 (year DESC, problem_number ASC).
  const articleGroups: SystematicNodeProblemsResult["articleGroups"] = [];
  const emptyArticles: SystematicNodeProblemsResult["emptyArticles"] = [];
  const toDetail = (p: (typeof problemList)[number]): ProblemDetail => ({
        problemId: p.problem_id,
        displayNo: p.display_no,
        examRound: p.exam_round,
        format: p.format,
        origin: p.origin,
        polarity: p.polarity,
        scope: p.scope,
        year: p.year,
        examRoundNo: p.exam_round_no,
        problemNumber: p.problem_number,
        bodyMd: p.body_md,
        importance: p.importance ?? 0,
        primaryArticleId: p.primary_article_id,
        primaryArticleNumber: p.articles?.article_number ?? null,
        primaryArticleLabel: p.articles?.display_label ?? null,
        unclassifiedChoices:
          p.format === "mc_box"
            ? 0
            : (choicesByProblem.get(p.problem_id) ?? []).filter(
                (c) => c.choiceType === null,
              ).length,
        reviewedAt: p.reviewed_at,
        mismatchFlaggedAt: p.mismatch_flagged_at,
        explanationMd: p.explanation_md,
        modelAnswerMd: p.model_answer_md,
        gradingRubricMd: p.grading_rubric_md,
        videoUrl: p.video_url,
        subjectiveKind: p.subjective_kind,
        subjectiveKeywords: p.subjective_keywords,
        subjectiveTopic: p.subjective_topic,
        rubricItems: parseRubricItems(p.rubric_items),
        rubricAiGeneratedAt: p.rubric_ai_generated_at,
        rubricReviewedAt: p.rubric_reviewed_at,
        mainCaseNumber: p.main_case_number,
        totalPoints: p.total_points,
        hasTable:
          hasTableMd(p.explanation_md) ||
          (choicesByProblem.get(p.problem_id) ?? []).some((c) =>
            hasTableMd(c.explanationMd),
          ) ||
          (boxItemsByProblem.get(p.problem_id) ?? []).some((b) =>
            hasTableMd(b.explanationMd),
          ),
        hasImage:
          hasImageMd(p.explanation_md) ||
          (choicesByProblem.get(p.problem_id) ?? []).some((c) =>
            hasImageMd(c.explanationMd),
          ) ||
          (boxItemsByProblem.get(p.problem_id) ?? []).some((b) =>
            hasImageMd(b.explanationMd),
          ),
        choices: choicesByProblem.get(p.problem_id) ?? [],
        boxItems: boxItemsByProblem.get(p.problem_id) ?? [],
  });
  for (const a of sortedArticles) {
    const probs = problemList
      .filter((p) => p.primary_article_id === a.article_id)
      .map(toDetail)
      .sort((x, y) => {
        if ((y.year ?? 0) !== (x.year ?? 0))
          return (y.year ?? 0) - (x.year ?? 0);
        return (x.problemNumber ?? 0) - (y.problemNumber ?? 0);
      });
    if (probs.length === 0) {
      emptyArticles.push({
        articleId: a.article_id,
        articleNumber: a.article_number,
        articleLabel: a.display_label,
      });
    } else {
      articleGroups.push({
        articleId: a.article_id,
        articleNumber: a.article_number,
        articleLabel: a.display_label,
        articlePath: String(a.path),
        problems: probs,
      });
    }
  }

  // 조문 미지정 핀 문제(primary_article_id=null) — 조문 그룹에 안 걸리므로 핀 노드별
  // 가상 그룹으로 이어붙인다(핀 노드의 트리 표시순 → 노드 내 problem_number ASC).
  const groupedIds = new Set(
    articleGroups.flatMap((g) => g.problems.map((p) => p.problemId)),
  );
  const leftovers = problemList.filter((p) => !groupedIds.has(p.problem_id));
  if (leftovers.length > 0) {
    const pinById = new Map(placedRows.map((r) => [r.problem_id, r]));
    const orderedNodes = sortSystematicTreeOrder(
      subtreeRows.map((n) => ({
        nodeId: n.node_id,
        parentId: n.parent_id,
        ord: n.ord,
        path: String(n.path),
      })),
    );
    const labelByNode = new Map(
      subtreeRows.map((n) => [n.node_id, n.display_label]),
    );
    for (const on of orderedNodes) {
      const probs = leftovers
        .filter((p) => pinById.get(p.problem_id)?.primary_node_id === on.nodeId)
        .map(toDetail)
        .sort(
          (x, y) => (x.problemNumber ?? 0) - (y.problemNumber ?? 0),
        );
      if (probs.length === 0) continue;
      articleGroups.push({
        articleId: `node:${on.nodeId}`,
        articleNumber: null,
        articleLabel: labelByNode.get(on.nodeId) ?? node.display_label,
        articlePath: on.path,
        problems: probs,
      });
    }
  }

  return {
    node: {
      nodeId: node.node_id,
      path: nodePath,
      displayLabel: node.display_label,
    },
    articleGroups,
    emptyArticles,
  };
}

export interface NodeProblemSequence {
  node: { nodeId: string; path: string; displayLabel: string };
  // 조문 순서 → 문제 순서대로 평탄화된 ID 목록 + 라벨.
  problems: Array<{
    problemId: string;
    articleId: string;
    articleLabel: string;
    problemNumber: number | null;
    year: number | null;
  }>;
}

// 노드 runner용 — 노드 subtree 안의 모든 문제 ID 를 조문 순서대로 + (year DESC, problem_number ASC) 로 반환.
// 무거운 ProblemDetail 은 fetch 하지 않고 prev/next nav 에 필요한 최소 정보만.
export async function getSystematicNodeProblemSequence(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<NodeProblemSequence | null> {
  const { data: node } = await client
    .from("systematic_nodes")
    .select("node_id, path, display_label, law_code")
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!node) return null;

  const { data: subtreeNodes } = await client
    .from("systematic_nodes")
    .select("node_id, path, parent_id, ord, display_label")
    .eq("law_code", node.law_code);
  const nodePath = String(node.path);
  const subtreeRows = (subtreeNodes ?? []).filter(
    (n) =>
      String(n.path) === nodePath || String(n.path).startsWith(nodePath + "."),
  );
  const subtreeIds = subtreeRows.map((n) => n.node_id);

  const links = await fetchAllIn(subtreeIds, (slice) =>
    client
      .from("article_systematic_links")
      .select("article_id")
      .in("node_id", slice)
      .order("article_id"),
  );
  const linkArticleIds = [...new Set(links.map((l) => l.article_id))];

  // feat-4-A-340 — node-pinned(primary_node_id) 우선 + 조문 파생. 핀은 노드에 조문 링크가
  // 없어도(임의 노드 고정) fetchPlacedProblemRows 가 잡으므로 링크 0개여도 빈 반환 금지.
  const list = await fetchPlacedProblemRows(client, subtreeIds, linkArticleIds);
  if (list.length === 0) {
    return {
      node: {
        nodeId: node.node_id,
        path: nodePath,
        displayLabel: node.display_label,
      },
      problems: [],
    };
  }

  // 그룹 기준 조문 = 노드 링크 조문 ∪ 배치된 문제의 조문(링크 안 된 핀의 조문 포함).
  const articleIds = [
    ...new Set([
      ...linkArticleIds,
      ...list
        .map((p) => p.primary_article_id)
        .filter((x): x is string => x != null),
    ]),
  ];
  const articles =
    articleIds.length === 0
      ? []
      : ((
          await client
            .from("articles")
            .select("article_id, display_label, path")
            .in("article_id", articleIds)
        ).data ?? []);
  const sortedArticles = [...articles].sort((a, b) =>
    compareArticlePath(String(a.path), String(b.path)),
  );

  const problems: NodeProblemSequence["problems"] = [];
  for (const a of sortedArticles) {
    const inArticle = list
      .filter((p) => p.primary_article_id === a.article_id)
      .sort((x, y) => {
        if ((y.year ?? 0) !== (x.year ?? 0))
          return (y.year ?? 0) - (x.year ?? 0);
        return (x.problem_number ?? 0) - (y.problem_number ?? 0);
      });
    for (const p of inArticle) {
      problems.push({
        problemId: p.problem_id,
        articleId: a.article_id,
        articleLabel: a.display_label,
        problemNumber: p.problem_number,
        year: p.year,
      });
    }
  }

  // 조문 미지정 핀 문제(primary_article_id=null — 상표 객관식 등)는 조문 그룹핑에 안 걸려
  // 통째로 탈락한다 → 핀 노드의 트리 표시순 → problem_number ASC 로 뒤에 이어붙인다.
  const grouped = new Set(problems.map((p) => p.problemId));
  const leftovers = list.filter((p) => !grouped.has(p.problem_id));
  if (leftovers.length > 0) {
    const orderedNodes = sortSystematicTreeOrder(
      subtreeRows.map((n) => ({
        nodeId: n.node_id,
        parentId: n.parent_id,
        ord: n.ord,
        path: String(n.path),
      })),
    );
    const nodeOrder = new Map(orderedNodes.map((n, i) => [n.nodeId, i]));
    const labelByNode = new Map(
      subtreeRows.map((n) => [n.node_id, n.display_label]),
    );
    leftovers.sort((x, y) => {
      const nx = nodeOrder.get(x.primary_node_id ?? "") ?? Infinity;
      const ny = nodeOrder.get(y.primary_node_id ?? "") ?? Infinity;
      if (nx !== ny) return nx - ny;
      if ((x.problem_number ?? 0) !== (y.problem_number ?? 0))
        return (x.problem_number ?? 0) - (y.problem_number ?? 0);
      return (x.year ?? 0) - (y.year ?? 0);
    });
    for (const p of leftovers) {
      problems.push({
        problemId: p.problem_id,
        articleId: "",
        articleLabel:
          labelByNode.get(p.primary_node_id ?? "") ?? node.display_label,
        problemNumber: p.problem_number,
        year: p.year,
      });
    }
  }

  return {
    node: {
      nodeId: node.node_id,
      path: nodePath,
      displayLabel: node.display_label,
    },
    problems,
  };
}

export interface SystematicNodeProblemStat {
  problemCount: number;
  firstProblemId: string | null;
  // 부분트리 내 별점(importance≥1) 문제 수.
  starredCount: number;
}

// 체계도 전체 노드별 {문제 수, 첫 문제 ID} — 문제 탭 좌측 트리용.
// listSystematicTopNodes 의 최상위 한정 로직을 전체 노드로 확장한 묶음 버전.
// 노드 클릭 → 첫 문제 + ?node= 로 체계별 풀이 진입.
export async function getSystematicNodeProblemStats(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<Record<string, SystematicNodeProblemStat>> {
  const { data: nodes } = await client
    .from("systematic_nodes")
    .select("node_id, path")
    .eq("law_code", lawCode);
  if (!nodes || nodes.length === 0) return {};

  // 1) 노드 ↔ 조문 링크 — 배치+페이지네이션 (민법 링크 1193 > max-rows 1000).
  const nodeIds = nodes.map((n) => n.node_id);
  const links = await fetchAllIn(nodeIds, (slice) =>
    client
      .from("article_systematic_links")
      .select("node_id, article_id")
      .in("node_id", slice)
      .order("article_id"),
  );

  // 2) 링크된 조문의 문제 (primary_article_id 기준) + primary_node_id 동반 fetch.
  const articleIds = [...new Set(links.map((l) => l.article_id))];
  const PROB_SEL =
    "problem_id, primary_article_id, primary_node_id, year, problem_number, importance";
  const probRows = await fetchAllIn(articleIds, (slice) =>
    client
      .from("problems")
      .select(PROB_SEL)
      .in("primary_article_id", slice)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  // node-pinned 문제 — 조문이 어느 노드에도 링크 안 됐어도(임의 노드 고정) 직접 잡는다.
  const seenIds = new Set(probRows.map((r) => r.problem_id));
  const pinnedRows = await fetchAllIn(nodeIds, (slice) =>
    client
      .from("problems")
      .select(PROB_SEL)
      .in("primary_node_id", slice)
      .is("deleted_at", null)
      .order("problem_id"),
  );
  for (const r of pinnedRows)
    if (!seenIds.has(r.problem_id)) {
      seenIds.add(r.problem_id);
      probRows.push(r);
    }

  // year DESC, problem_number ASC.
  const sorted = [...probRows].sort((x, y) => {
    if ((y.year ?? 0) !== (x.year ?? 0)) return (y.year ?? 0) - (x.year ?? 0);
    return (x.problem_number ?? 0) - (y.problem_number ?? 0);
  });
  // feat-4-A-340 — node-pinned 은 노드별, 나머지는 조문별로 분리 집계.
  const orderOf = new Map<string, number>();
  const problemsByArticle = new Map<string, string[]>();
  const starredByArticle = new Map<string, number>();
  const problemsByNode = new Map<string, string[]>();
  const starredByNode = new Map<string, number>();
  sorted.forEach((p, idx) => {
    orderOf.set(p.problem_id, idx);
    const starred = (p.importance ?? 0) >= 1;
    if (p.primary_node_id) {
      const arr = problemsByNode.get(p.primary_node_id) ?? [];
      arr.push(p.problem_id);
      problemsByNode.set(p.primary_node_id, arr);
      if (starred)
        starredByNode.set(
          p.primary_node_id,
          (starredByNode.get(p.primary_node_id) ?? 0) + 1,
        );
    } else if (p.primary_article_id) {
      const arr = problemsByArticle.get(p.primary_article_id) ?? [];
      arr.push(p.problem_id);
      problemsByArticle.set(p.primary_article_id, arr);
      if (starred)
        starredByArticle.set(
          p.primary_article_id,
          (starredByArticle.get(p.primary_article_id) ?? 0) + 1,
        );
    }
  });
  const articlesByNode = new Map<string, string[]>();
  for (const l of links) {
    const arr = articlesByNode.get(l.node_id) ?? [];
    arr.push(l.article_id);
    articlesByNode.set(l.node_id, arr);
  }

  // 3) 노드별 subtree(path prefix) 집계 — node-pinned(노드별) + 조문 파생(조문별).
  const out: Record<string, SystematicNodeProblemStat> = {};
  for (const node of nodes) {
    const nodePath = String(node.path);
    const subtreeNodeIds: string[] = [];
    const subtreeArticleIds = new Set<string>();
    for (const n of nodes) {
      const p = String(n.path);
      if (p === nodePath || p.startsWith(nodePath + ".")) {
        subtreeNodeIds.push(n.node_id);
        for (const aid of articlesByNode.get(n.node_id) ?? []) {
          subtreeArticleIds.add(aid);
        }
      }
    }
    let count = 0;
    let starredCount = 0;
    let firstProblemId: string | null = null;
    let firstOrder = Infinity;
    const consider = (id: string | undefined) => {
      if (!id) return;
      const o = orderOf.get(id) ?? Infinity;
      if (o < firstOrder) {
        firstOrder = o;
        firstProblemId = id;
      }
    };
    for (const nid of subtreeNodeIds) {
      const probs = problemsByNode.get(nid);
      if (probs && probs.length > 0) {
        count += probs.length;
        starredCount += starredByNode.get(nid) ?? 0;
        consider(probs[0]);
      }
    }
    for (const aid of subtreeArticleIds) {
      const probs = problemsByArticle.get(aid);
      if (probs && probs.length > 0) {
        count += probs.length;
        starredCount += starredByArticle.get(aid) ?? 0;
        consider(probs[0]);
      }
    }
    out[node.node_id] = { problemCount: count, firstProblemId, starredCount };
  }
  return out;
}

// ── 주관식 ↔ 체계도 복수 배치 (problem_systematic_links) ─────────────────
// 주관식은 설문별 메인 논점이 여러 주제 노드에 걸리므로 primary_node_id(단일)
// 대신 링크 테이블로 복수 배치한다. 객관식 통계(getSystematicNodeProblemStats)와
// 분리 — 링크는 주관식 탭 트리에만 합산한다.

export interface ProblemPlacement {
  linkId: string;
  nodeId: string;
  label: string;
  note: string | null;
  seq: number | null;
}

// 문제별 배치 목록 (목록 배지·뷰어·편집 화면 공용). 노드 라벨 포함, seq 순.
export async function getProblemPlacementsBulk(
  client: SupabaseClient<Database>,
  problemIds: string[],
): Promise<Record<string, ProblemPlacement[]>> {
  if (problemIds.length === 0) return {};
  const rows = await fetchAllIn(problemIds, (slice) =>
    client
      .from("problem_systematic_links")
      .select("link_id, problem_id, node_id, note, seq, systematic_nodes(display_label)")
      .in("problem_id", slice)
      .order("seq", { ascending: true, nullsFirst: false }),
  );
  const out: Record<string, ProblemPlacement[]> = {};
  for (const r of rows) {
    (out[r.problem_id] ??= []).push({
      linkId: r.link_id,
      nodeId: r.node_id,
      label: r.systematic_nodes?.display_label ?? "",
      note: r.note,
      seq: r.seq,
    });
  }
  return out;
}

// 트리 노드 아래에 붙는 기출 leaf — "2015년 제52회 문제2" 표기용 메타.
export interface SubjectiveNodeLeaf {
  problemId: string;
  year: number | null;
  examRoundNo: number | null;
  problemNumber: number | null;
}

// 주관식 탭 좌측 트리용 — 노드별 subtree {문제 수, 첫 문제, 별점 수} 합산 +
// 노드 직접 배치 기출 leaf 목록. 링크(problem_systematic_links) 기반.
// 한 문제가 subtree 안 여러 노드에 걸려도 카운트는 1회만 센다.
export async function getSubjectiveNodeProblemStats(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<{
  stats: Record<string, SystematicNodeProblemStat>;
  // 노드 직접 배치 기출 leaf — 트리에서 노드 아래 "2015년 제52회 문제2" 로 표시.
  leaves: Record<string, SubjectiveNodeLeaf[]>;
}> {
  const empty = { stats: {}, leaves: {} };
  const { data: nodes } = await client
    .from("systematic_nodes")
    .select("node_id, path")
    .eq("law_code", lawCode);
  if (!nodes || nodes.length === 0) return empty;
  const nodeIds = nodes.map((n) => n.node_id);
  const links = await fetchAllIn(nodeIds, (slice) =>
    client
      .from("problem_systematic_links")
      .select("node_id, problem_id, problems!inner(problem_id, year, exam_round_no, problem_number, importance, deleted_at)")
      .in("node_id", slice)
      .is("problems.deleted_at", null),
  );
  if (links.length === 0) return empty;
  // 표시 순서(연도 DESC, 문제번호 ASC) — firstProblemId 판정용.
  const metaById = new Map<
    string,
    {
      year: number | null;
      examRoundNo: number | null;
      problemNumber: number | null;
      starred: boolean;
    }
  >();
  for (const l of links) {
    metaById.set(l.problem_id, {
      year: l.problems.year,
      examRoundNo: l.problems.exam_round_no,
      problemNumber: l.problems.problem_number,
      starred: (l.problems.importance ?? 0) >= 1,
    });
  }
  const order = [...metaById.keys()].sort((a, b) => {
    const x = metaById.get(a)!;
    const y = metaById.get(b)!;
    if ((y.year ?? 0) !== (x.year ?? 0)) return (y.year ?? 0) - (x.year ?? 0);
    return (x.problemNumber ?? 0) - (y.problemNumber ?? 0);
  });
  const orderOf = new Map(order.map((id, i) => [id, i]));
  const problemsByNode = new Map<string, string[]>();
  for (const l of links) {
    const arr = problemsByNode.get(l.node_id) ?? [];
    arr.push(l.problem_id);
    problemsByNode.set(l.node_id, arr);
  }
  const out: Record<string, SystematicNodeProblemStat> = {};
  for (const node of nodes) {
    const nodePath = String(node.path);
    const seen = new Set<string>();
    for (const n of nodes) {
      const p = String(n.path);
      if (p !== nodePath && !p.startsWith(nodePath + ".")) continue;
      for (const pid of problemsByNode.get(n.node_id) ?? []) seen.add(pid);
    }
    if (seen.size === 0) continue;
    let firstProblemId: string | null = null;
    let firstOrder = Infinity;
    let starredCount = 0;
    for (const pid of seen) {
      const o = orderOf.get(pid) ?? Infinity;
      if (o < firstOrder) {
        firstOrder = o;
        firstProblemId = pid;
      }
      if (metaById.get(pid)?.starred) starredCount += 1;
    }
    out[node.node_id] = { problemCount: seen.size, firstProblemId, starredCount };
  }

  // 노드 직접 배치 leaf — 연도 ASC(오래된→최신), 같은 연도는 문제번호 ASC.
  const leaves: Record<string, SubjectiveNodeLeaf[]> = {};
  for (const [nid, pids] of problemsByNode) {
    leaves[nid] = [...new Set(pids)]
      .map((pid) => ({ problemId: pid, ...metaById.get(pid)! }))
      .map(({ starred: _s, ...leaf }) => leaf)
      .sort((a, b) => {
        if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
        return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
      });
  }
  return { stats: out, leaves };
}

// 노드 subtree 에 배치된 주관식 문제 ID 집합 — 주관식 탭 ?node= 필터용.
export async function getSubjectiveNodeProblemIds(
  client: SupabaseClient<Database>,
  subtreeNodeIds: string[],
): Promise<Set<string>> {
  if (subtreeNodeIds.length === 0) return new Set();
  const links = await fetchAllIn(subtreeNodeIds, (slice) =>
    client
      .from("problem_systematic_links")
      .select("problem_id")
      .in("node_id", slice),
  );
  return new Set(links.map((l) => l.problem_id));
}

// 출제된 연도 distinct (필터 dropdown 용).
export async function listProblemYears(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<number[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];
  const { data } = await client
    .from("problems")
    .select("year")
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .not("year", "is", null);
  const set = new Set<number>();
  for (const r of data ?? []) {
    if (r.year != null) set.add(r.year);
  }
  return [...set].sort((a, b) => b - a);
}

// 인접 문제 (prev / next). 같은 law_id 안에서 (year DESC, problem_number ASC) 순서 기준.
// 문제집 정렬: 최근 연도 먼저, 같은 연도면 문제번호 순.
export interface AdjacentProblem {
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  examNumber: number | null;
  origin: Database["public"]["Enums"]["problem_origin"];
}
export async function getAdjacentProblems(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<{ prev: AdjacentProblem | null; next: AdjacentProblem | null }> {
  const { data: cur } = await client
    .from("problems")
    .select("law_id, year, problem_number, exam_round")
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur || !cur.law_id) return { prev: null, next: null };
  // 기출/변형은 실제 시험번호(exam_number)로, 그 외는 노드 순번(problem_number)으로 인접 계산.
  //   연도 내에서 exam_number 우선(nulls last) → problem_number 타이브레이커. 이렇게 하면
  //   기출 7번의 prev=6번·next=8번(시험번호 순)이 되고, problem_number(노드 순번) 스왑으로
  //   인접이 어긋나던 문제가 해소된다.
  //   같은 차수(1차 객관식/2차 주관식) 안에서만 이동 — 화면 목록도 차수별 분리 표시.
  const { data: rows } = await client
    .from("problems")
    .select("problem_id, year, problem_number, exam_number, origin")
    .eq("law_id", cur.law_id)
    .eq("exam_round", cur.exam_round)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("exam_number", { ascending: true, nullsFirst: false })
    .order("problem_number", { ascending: true, nullsFirst: false });
  if (!rows) return { prev: null, next: null };
  const idx = rows.findIndex((r) => r.problem_id === problemId);
  if (idx < 0) return { prev: null, next: null };
  const toAdj = (
    r: (typeof rows)[number] | undefined,
  ): AdjacentProblem | null =>
    r
      ? {
          problemId: r.problem_id,
          year: r.year,
          problemNumber: r.problem_number,
          examNumber: r.exam_number,
          origin: r.origin,
        }
      : null;
  return {
    prev: toAdj(rows[idx - 1]),
    next: toAdj(rows[idx + 1]),
  };
}

// ──────────────────────────────────────────────────────────────────────
// feat — 강사 검증·승인 큐 (§2)
//   review_status='draft' 문제 목록 + 단건 상세(선지·박스·근거 청크 포함).
//   approve/reject 액션은 별도 API.
// ──────────────────────────────────────────────────────────────────────

export interface ReviewQueueItem {
  problemId: string;
  lawCode: string | null;
  lawLabel: string | null;
  origin: ProblemOrigin;
  format: ProblemFormat;
  bodyMd: string;
  createdAt: string;
  generatedBy: string | null;
  generatedAt: string | null;
  sourceChunkCount: number;
  primaryArticleLabel: string | null;
  // 구조 검증 결과 (1차 자동 필터, §4 에서 채움). 지금은 null.
  structureWarning: string | null;
}

export interface ListReviewFilters {
  lawCode?: LawSubjectSlug;
  format?: ProblemFormat;
  origin?: ProblemOrigin;
  // 'draft' | 'rejected' — approved 는 검토 완료라 큐 밖.
  status?: "draft" | "rejected";
  limit?: number;
}

export async function listProblemsForReview(
  client: SupabaseClient<Database>,
  filters: ListReviewFilters = {},
): Promise<ReviewQueueItem[]> {
  const status = filters.status ?? "draft";
  let q = client
    .from("problems")
    .select(
      "problem_id, origin, format, body_md, created_at, generated_by, generated_at, source_chunk_ids, law_id, primary_article_id, laws(law_code, short_label), articles!primary_article_id(display_label)",
    )
    .eq("review_status", status)
    .is("deleted_at", null);
  if (filters.format) q = q.eq("format", filters.format);
  if (filters.origin) q = q.eq("origin", filters.origin);
  if (filters.lawCode) {
    const { data: law } = await client
      .from("laws")
      .select("law_id")
      .eq("law_code", filters.lawCode)
      .maybeSingle();
    if (!law) return [];
    q = q.eq("law_id", law.law_id);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    problemId: r.problem_id,
    lawCode: r.laws?.law_code ?? null,
    lawLabel: r.laws?.short_label ?? null,
    origin: r.origin as ProblemOrigin,
    format: r.format as ProblemFormat,
    bodyMd: r.body_md,
    createdAt: r.created_at,
    generatedBy: r.generated_by,
    generatedAt: r.generated_at,
    sourceChunkCount: Array.isArray(r.source_chunk_ids)
      ? r.source_chunk_ids.length
      : 0,
    primaryArticleLabel: r.articles?.display_label ?? null,
    structureWarning: null,
  }));
}

export interface ReviewDetailChoice {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
}

export interface ReviewDetailBoxItem {
  boxItemId: string;
  positionIndex: number;
  marker: string;
  bodyMd: string;
  explanationMd: string | null;
  oxTruth: string | null;
}

export interface ReviewSourceChunk {
  chunkId: string;
  sourceType: string;
  headingPath: string | null;
  bodyText: string;
}

export interface ReviewDetail {
  problemId: string;
  lawCode: string | null;
  origin: ProblemOrigin;
  format: ProblemFormat;
  reviewStatus: "draft" | "approved" | "rejected";
  bodyMd: string;
  explanationMd: string | null;
  rejectedReason: string | null;
  generatedBy: string | null;
  generatedAt: string | null;
  sourceChunkIds: string[];
  genRange: unknown;
  primaryArticleLabel: string | null;
  choices: ReviewDetailChoice[];
  boxItems: ReviewDetailBoxItem[];
  sourceChunks: ReviewSourceChunk[];
}

export async function getProblemForReview(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ReviewDetail | null> {
  const { data: row } = await client
    .from("problems")
    .select(
      "problem_id, origin, format, review_status, body_md, explanation_md, rejected_reason, generated_by, generated_at, source_chunk_ids, gen_range, laws(law_code), articles!primary_article_id(display_label)",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return null;

  const [choicesRes, boxRes] = await Promise.all([
    client
      .from("problem_choices")
      .select("choice_id, choice_index, body_md, is_correct, explanation_md")
      .eq("problem_id", problemId)
      .order("choice_index", { ascending: true }),
    client
      .from("problem_box_items")
      .select(
        "box_item_id, position_index, marker, body_md, explanation_md, ox_truth",
      )
      .eq("problem_id", problemId)
      .order("position_index", { ascending: true }),
  ]);

  const sourceChunkIds = Array.isArray(row.source_chunk_ids)
    ? (row.source_chunk_ids as string[])
    : [];
  let sourceChunks: ReviewSourceChunk[] = [];
  if (sourceChunkIds.length > 0) {
    const { data: chunks } = await client
      .from("content_chunks")
      .select("chunk_id, source_type, heading_path, body_text")
      .in("chunk_id", sourceChunkIds);
    sourceChunks = (chunks ?? []).map((c) => ({
      chunkId: c.chunk_id,
      sourceType: c.source_type,
      headingPath: c.heading_path,
      bodyText: c.body_text,
    }));
  }

  return {
    problemId: row.problem_id,
    lawCode: row.laws?.law_code ?? null,
    origin: row.origin as ProblemOrigin,
    format: row.format as ProblemFormat,
    reviewStatus: row.review_status as "draft" | "approved" | "rejected",
    bodyMd: row.body_md,
    explanationMd: row.explanation_md,
    rejectedReason: row.rejected_reason,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
    sourceChunkIds,
    genRange: row.gen_range,
    primaryArticleLabel: row.articles?.display_label ?? null,
    choices: (choicesRes.data ?? []).map((c) => ({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
    })),
    boxItems: (boxRes.data ?? []).map((b) => ({
      boxItemId: b.box_item_id,
      positionIndex: b.position_index,
      marker: b.marker,
      bodyMd: b.body_md,
      explanationMd: b.explanation_md,
      oxTruth: b.ox_truth,
    })),
    sourceChunks,
  };
}

// ── 주관식 모범답안 인용 판례 배지 (설문별) ─────────────────────────────────
//   모범답안·채점기준 텍스트에서 사건번호를 추출해 DB 판례와 매칭.
//   "## Ⅱ. 설문(1)…" 헤딩 단위로 그룹핑 — 설문 헤딩이 없는 섹션·채점기준 인용은 '공통'.
//   뷰어에서 배지 → 팝업(요지 학습) / 학습화면(판례 뷰어 이동) 두 동선 제공.

// 지방법원 사건부호(가합·카합 등)는 여러 글자이므로 한 글자 부호보다 앞에 두어야 한다.
const ANSWER_CASE_NUM_RE = /\d{2,4}(?:가합|가단|가소|카합|카단|고합|고단|다|나|후|허|마|도|누|두)\d+/g;

// '2008후934로 오인용 시 감점'·'취지 불일치로 감점'처럼 잘못된 인용을 경고하는 문맥의
// 사건번호는 관련 판례가 아니므로 배지에서 제외한다.
// export — 판례 목록의 2차 기출 칩(문제 매칭)도 같은 규칙을 쓴다(cases/queries.server).
export function extractAnswerCaseNums(text: string): string[] {
  return extractCaseNums(text);
}
function extractCaseNums(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ANSWER_CASE_NUM_RE)) {
    const ctx = text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 40);
    if (/오인용|잘못\s*인용|취지 불일치|오인용?하면 감점/.test(ctx)) continue;
    out.push(m[0]);
  }
  return [...new Set(out)];
}

export async function getAnswerCitedCaseGroups(
  client: SupabaseClient<Database>,
  problem: {
    format: string;
    modelAnswerMd: string | null;
    gradingRubricMd: string | null;
    explanationMd?: string | null;
    choiceExplanations?: Array<string | null>;
    // 메인 판례 지정(problems.main_case_number) — 그룹 내 맨 앞 정렬 + isMain 표시.
    mainCaseNumber?: string | null;
  },
  fallbackSubject: string,
): Promise<AnswerCaseGroup[]> {
  const groups: Array<{ label: string; nums: string[] }> = [];
  const seenInSetmun = new Set<string>();
  if (problem.format === "subjective") {
    const answer = problem.modelAnswerMd ?? "";
    if (!answer.trim()) return [];
    // 섹션 분할 — '#'/'##' 헤딩. 설문 라벨은 상태 추적으로 상속:
    // '# 설문 (1)…'(h1 설문 제목 + ## 하위 목차 구조)처럼 개별 섹션 헤딩에 설문 번호가
    // 없어도, 직전 설문 헤딩의 라벨을 이어받아 그 설문 그룹으로 귀속시킨다.
    const parts = answer.split(/^(?=#{1,2}\s)/m);
    let currentLabel: string | null = null;
    const numsByLabel = new Map<string, string[]>();
    for (const part of parts) {
      const heading = part.match(/^#{1,2}\s+([^\n]+)/)?.[1] ?? "";
      const m = heading.match(/설문\s*\(?([\d①-⑨]+)\)?/);
      if (m) currentLabel = `설문(${m[1]})`;
      const nums = extractCaseNums(part);
      if (!nums.length) continue;
      const label = currentLabel ?? "공통";
      const list = numsByLabel.get(label) ?? [];
      for (const n of nums) if (!list.includes(n)) list.push(n);
      numsByLabel.set(label, list);
    }
    for (const [label, nums] of numsByLabel) {
      groups.push({ label, nums });
      if (label !== "공통") for (const n of nums) seenInSetmun.add(n);
    }
    // 채점기준 인용도 '공통'에 합류(설문 그룹에 이미 있으면 제외).
    const rubricNums = extractCaseNums(problem.gradingRubricMd ?? "").filter(
      (n) => !seenInSetmun.has(n),
    );
    if (rubricNums.length) groups.push({ label: "공통", nums: rubricNums });
  } else {
    // 객관식 — 종합해설 + 선지/박스 해설의 인용 판례를 '해설' 단일 그룹으로.
    const all = [problem.explanationMd ?? "", ...(problem.choiceExplanations ?? [])].join("\n");
    const nums = extractCaseNums(all);
    if (!nums.length) return [];
    groups.push({ label: "해설", nums });
  }

  // '공통' 병합 + 설문 그룹과 중복 제거.
  const merged: Array<{ label: string; nums: string[] }> = [];
  const commonNums = new Set<string>();
  for (const g of groups) {
    if (g.label === "공통") {
      for (const n of g.nums) if (!seenInSetmun.has(n)) commonNums.add(n);
    } else merged.push(g);
  }
  if (commonNums.size) merged.push({ label: "공통", nums: [...commonNums] });
  if (!merged.length) return [];

  // DB 매칭 — 사건번호 부분일치(병합 사건 "2005다71659·71666" 대응).
  // 같은 사건번호가 법률별로 별도 row 로 존재할 수 있으므로(예: 2018후11360 특허·상표)
  // 문제의 과목(fallbackSubject)과 일치하는 판례를 우선 선택한다.
  const uniq = [...new Set(merged.flatMap((g) => g.nums))].slice(0, 20);
  const byNum = new Map<string, AnswerCitedCase>();
  for (const num of uniq) {
    const { data } = await client
      .from("cases")
      .select(
        "case_id, case_number, court, case_title, summary_title, summary_body_md, summary_items, subject_laws",
      )
      .ilike("case_number", `%${num}%`)
      .is("deleted_at", null)
      .limit(5);
    const row =
      data?.find((r) =>
        ((r.subject_laws as string[] | null) ?? []).includes(fallbackSubject),
      ) ?? data?.[0];
    if (!row) continue;
    // 판결요지 쟁점 단위 구조화 — 다중 쟁점([1][2]…)은 summary_items 전체(재번호), 없으면 단일.
    const stripNo = (s: string) => s.replace(/^\[\d+\]\s*/, "").trim();
    const raw = Array.isArray(row.summary_items)
      ? (row.summary_items as Array<{ title?: string; body?: string }>)
      : [];
    const items = (
      raw.length > 0
        ? raw.map((it, i) => ({
            title: `${raw.length > 1 ? `[${i + 1}] ` : ""}${stripNo(it.title ?? "")}`,
            body: ((it.body ?? "").trim()).slice(0, 6000),
          }))
        : [
            {
              title: stripNo(row.summary_title ?? row.case_title ?? row.case_number),
              body: (row.summary_body_md ?? "").trim().slice(0, 6000),
            },
          ]
    ).filter((it) => it.title || it.body);
    byNum.set(num, {
      caseId: row.case_id,
      caseNumber: row.case_number,
      court: row.court,
      items,
      subjectSlug: (row.subject_laws as string[] | null)?.[0] ?? fallbackSubject,
    });
  }

  // 메인 판례는 복수 지정 가능 — ", " 구분 목록. 각 항목과의 부분일치로 판정.
  const mains = (problem.mainCaseNumber ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return merged
    .map((g) => {
      const cases = g.nums
        .map((n) => byNum.get(n))
        .filter((c): c is AnswerCitedCase => !!c)
        .map((c) => ({
          ...c,
          // 추출 사건번호 또는 DB 사건번호(병합 표기)와의 부분일치로 판정.
          isMain: mains.some(
            (m) => c.caseNumber.includes(m) || m.includes(c.caseNumber),
          ),
        }));
      // 메인 판례는 그룹 내 맨 앞으로(안정 정렬 — 나머지 순서 유지).
      cases.sort((a, b) => Number(b.isMain) - Number(a.isMain));
      return { label: g.label, cases };
    })
    .filter((g) => g.cases.length > 0);
}

// 객관식 선지/박스 해설 텍스트 인용 판례 → 배지용 참조. related_case 링크와 별개로
// 해설 본문의 사건번호를 추출해 DB 판례와 매칭(링크된 판례와 중복 번호는 제외).
export async function getExplanationCaseRefsByItem(
  client: SupabaseClient<Database>,
  items: Array<{
    id: string;
    explanationMd: string | null;
    linkedCaseNumber?: string | null;
  }>,
  fallbackSubject: string,
): Promise<Record<string, ChoiceCaseRef[]>> {
  const numsByItem = new Map<string, string[]>();
  const uniq = new Set<string>();
  for (const it of items) {
    const t = it.explanationMd ?? "";
    if (!t) continue;
    const nums = extractCaseNums(t).filter(
      (n) => !(it.linkedCaseNumber ?? "").includes(n),
    );
    if (!nums.length) continue;
    numsByItem.set(it.id, nums);
    for (const n of nums) uniq.add(n);
  }
  if (!uniq.size) return {};
  const byNum = new Map<string, ChoiceCaseRef>();
  for (const num of [...uniq].slice(0, 40)) {
    const { data } = await client
      .from("cases")
      .select("case_id, case_number, subject_laws")
      .ilike("case_number", `%${num}%`)
      .is("deleted_at", null)
      .limit(5);
    // 법률별 동일 사건번호 row 중 문제 과목 우선(getAnswerCitedCaseGroups 와 동일 규칙).
    const row =
      data?.find((r) =>
        ((r.subject_laws as string[] | null) ?? []).includes(fallbackSubject),
      ) ?? data?.[0];
    if (!row) continue;
    byNum.set(num, {
      caseId: row.case_id,
      caseNumber: num,
      subjectSlug: (row.subject_laws as string[] | null)?.[0] ?? fallbackSubject,
    });
  }
  const out: Record<string, ChoiceCaseRef[]> = {};
  for (const [id, nums] of numsByItem) {
    const refs = nums.map((n) => byNum.get(n)).filter((r): r is ChoiceCaseRef => !!r);
    // 같은 판례 중복 제거(요지 병합 사건 등).
    const seen = new Set<string>();
    const deduped = refs.filter((r) => (seen.has(r.caseId) ? false : (seen.add(r.caseId), true)));
    if (deduped.length) out[id] = deduped;
  }
  return out;
}

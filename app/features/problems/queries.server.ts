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

import {
  getBookmarksByTargets,
  listMemosByTargets,
} from "~/features/annotations/queries.server";
import { articleSlug } from "~/features/laws/lib/identifier";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import {
  MC_FORMATS,
  type OxQuestionItem,
  type OxRefAnnotations,
  type OxTruth,
  parseRubricItems,
} from "./labels";

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

  let query = client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, articles!primary_article_id(article_number, display_label, path)",
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
    const safe = filters.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike("body_md", `%${safe}%`);
  }
  if (filters.primaryArticleId)
    query = query.eq("primary_article_id", filters.primaryArticleId);
  if (filters.reviewStatus === "reviewed")
    query = query.not("reviewed_at", "is", null);
  else if (filters.reviewStatus === "pending")
    query = query.is("reviewed_at", null);
  else if (filters.reviewStatus === "mismatch")
    query = query.not("mismatch_flagged_at", "is", null);

  const { data, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error) throw error;
  const rows = data ?? [];

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
      "problem_id, body_md, format, origin, year, problem_number, created_at, subjective_kind, subjective_topic, laws!inner(law_code)",
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
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    problemId: r.problem_id,
    bodySnippet:
      (r.body_md ?? "").length > 100
        ? `${(r.body_md ?? "").slice(0, 100)}…`
        : (r.body_md ?? ""),
    format: r.format,
    origin: r.origin,
    year: r.year,
    problemNumber: r.problem_number,
    createdAt: r.created_at,
    lawCode: r.laws.law_code,
    subjectiveKind: r.subjective_kind,
    subjectiveTopic: r.subjective_topic,
  }));
}

// 정오문제 — 특정 조문에 연결된 OX 가능 지문 (객관식 choice + box-item 통합).
// article-viewer 우측 "정오문제" 탭에서 무작위 풀이용.
// 타입(OxTruth, OxQuestionItem, OxRefAnnotations) 은 ./labels 에 정의 — RR vite plugin
// 의 module-graph 분석이 component → loader 타입 추적 시 `.server.ts` 의존성을 만들지 않게.

// 운영자 OX 검토용 — 학생 노출(ox_truth NOT NULL + ineligible=false + article 매핑) 조건과
// 무관하게 후보 지문을 모두 조회. 운영자는 이 화면에서 ox_truth 수정 / ineligible 토글 가능.
export type OxReviewStatus = "all" | "active" | "ineligible" | "untruthed";
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
  relatedArticleId: string | null;
  relatedArticleLabel: string | null;
  relatedArticleNumber: string | null;
  isCorrect: boolean | null; // choice 만 (auto 추론 참고)
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
      "choice_id, problem_id, body_md, ox_truth, ox_ineligible, related_article_id, is_correct, problems!inner(year, problem_number, origin, deleted_at, law_id)",
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
      bodyMd: r.body_md,
      marker: null,
      oxTruth: r.ox_truth as OxTruth | null,
      oxIneligible: r.ox_ineligible ?? false,
      relatedArticleId: r.related_article_id,
      relatedArticleLabel: null,
      relatedArticleNumber: null,
      isCorrect: r.is_correct ?? null,
    });
  }

  // 2) problem_box_items.
  let boxQuery = client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, body_md, marker, ox_truth, ox_ineligible, related_article_id, problems!inner(year, problem_number, origin, deleted_at, law_id)",
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
      relatedArticleId: r.related_article_id,
      relatedArticleLabel: null,
      relatedArticleNumber: null,
      isCorrect: null,
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
  patch: { oxTruth?: OxTruth | null; oxIneligible?: boolean },
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
        "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
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
      "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
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
      bodyMd: r.body_md,
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
        "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
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
        bodyMd: r.body_md,
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
      "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at, law_id)",
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
      bodyMd: r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
    });
  }

  return out;
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

  // 1. problem_choices.
  let choiceQuery = client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_truth, explanation_md, related_node_id, problems!inner(year, problem_number, origin, deleted_at, primary_article_id, primary_node_id)",
    )
    .eq("related_article_id", articleId)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    // 삭제된 문제 제외를 SQL 에서(루프 skip 만으로는 limit 이 삭제 행으로 채워져 staff 화면이
    // 굶는다 — staff RLS 는 deleted 도 읽으므로). 중복 재import 로 삭제된 구버전 지문이 limit 을
    // 점유하던 버그.
    .is("problems.deleted_at", null);
  if (!includeUnapproved) {
    choiceQuery = choiceQuery.eq("problems.review_status", "approved");
  }
  const { data: choiceRows } = await choiceQuery.limit(limit);
  for (const r of choiceRows ?? []) {
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
      bodyMd: r.body_md,
      oxTruth: r.ox_truth as OxTruth,
      explanationMd: r.explanation_md,
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      origin: r.problems.origin,
    });
  }

  // 2. problem_box_items (박스형 사례 지문).
  let boxQuery = client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, body_md, ox_truth, explanation_md, related_node_id, problems!inner(year, problem_number, origin, deleted_at, primary_article_id, primary_node_id)",
    )
    .eq("related_article_id", articleId)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    // 삭제된 문제 제외 (choices 와 동일 — limit 이 삭제 행으로 채워지지 않도록 SQL 필터).
    .is("problems.deleted_at", null);
  if (!includeUnapproved) {
    boxQuery = boxQuery.eq("problems.review_status", "approved");
  }
  const { data: boxRows } = await boxQuery.limit(limit);
  for (const r of boxRows ?? []) {
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
    });
  }

  // 정렬: 연도 DESC, 문항 ASC. 같은 연도 내에서는 안정적 순서로.
  out.sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya !== yb) return yb - ya;
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });

  return out.slice(0, limit);
}

// OX 패널에서 사용자가 정답 확인 후 메모/즐겨찾기를 달 수 있게,
// 각 OX ref(choice/box-item) 별 memo / bookmark 를 한 번에 fetch 해서 refId 키로 반환.
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

  const [choiceMemos, choiceBookmarks, boxMemos, boxBookmarks] =
    await Promise.all([
      listMemosByTargets(client, userId, "problem_choice", choiceIds),
      getBookmarksByTargets(client, userId, "problem_choice", choiceIds),
      listMemosByTargets(client, userId, "problem_box_item", boxIds),
      getBookmarksByTargets(client, userId, "problem_box_item", boxIds),
    ]);

  const out: Record<string, OxRefAnnotations> = {};
  for (const it of items) {
    if (it.refType === "choice") {
      out[it.refId] = {
        memos: choiceMemos[it.refId] ?? [],
        bookmark: choiceBookmarks[it.refId] ?? null,
      };
    } else {
      out[it.refId] = {
        memos: boxMemos[it.refId] ?? [],
        bookmark: boxBookmarks[it.refId] ?? null,
      };
    }
  }
  return out;
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
    // 객관식 1차 기출문제만.
    if (p.origin !== "past_exam" || p.exam_round !== "first") continue;
    if (!MC_FORMATS.includes(p.format)) continue;
    if (seen.has(p.problem_id)) continue;
    seen.add(p.problem_id);
    out.push({
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      lawCode: p.laws.law_code,
    });
  }
  // 연도 내림차순, 같은 연도면 번호 오름차순.
  out.sort((a, b) => {
    if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
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
    // 객관식 1차 기출문제만.
    if (p.origin !== "past_exam" || p.exam_round !== "first") continue;
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
    });
    byCase.set(r.case_id, list);
  }
  // 칩 표시 순서 — 연도 오름차순, 같은 연도면 문항번호 오름차순.
  for (const list of byCase.values()) {
    list.sort((a, b) => {
      if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
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
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, law_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, articles!primary_article_id(article_number, display_label)",
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
    examRound: problem.exam_round,
    format: problem.format,
    origin: problem.origin,
    polarity: problem.polarity,
    scope: problem.scope,
    year: problem.year,
    examRoundNo: problem.exam_round_no,
    problemNumber: problem.problem_number,
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
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, articles!primary_article_id(article_number, display_label)",
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
  const CHUNK = 150;
  const byId = new Map<string, PlacedProblemRow>();
  for (let i = 0; i < subtreeNodeIds.length; i += CHUNK) {
    const slice = subtreeNodeIds.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    const { data } = await client
      .from("problems")
      .select(SEL)
      .in("primary_node_id", slice)
      .is("deleted_at", null);
    for (const r of data ?? []) byId.set(r.problem_id, r);
  }
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const slice = articleIds.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    const { data } = await client
      .from("problems")
      .select(SEL)
      .in("primary_article_id", slice)
      .is("primary_node_id", null)
      .is("deleted_at", null);
    for (const r of data ?? []) byId.set(r.problem_id, r);
  }
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
      const { data: links } = await client
        .from("article_systematic_links")
        .select("article_id")
        .in("node_id", subtreeNodeIds);
      articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
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
    .select("node_id, path")
    .eq("law_code", node.law_code);
  const nodePath = String(node.path);
  const subtreeIds = (subtreeNodes ?? [])
    .filter(
      (n) =>
        String(n.path) === nodePath ||
        String(n.path).startsWith(nodePath + "."),
    )
    .map((n) => n.node_id);

  // subtree 에 매핑된 article_id 들.
  const { data: links } = await client
    .from("article_systematic_links")
    .select("article_id")
    .in("node_id", subtreeIds);
  const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
  if (articleIds.length === 0) {
    return {
      node: {
        nodeId: node.node_id,
        path: nodePath,
        displayLabel: node.display_label,
      },
      articleGroups: [],
      emptyArticles: [],
    };
  }

  // article 정보 (path/article_number/display_label) — 조문 순서로 정렬.
  const { data: articles } = await client
    .from("articles")
    .select("article_id, article_number, display_label, path")
    .in("article_id", articleIds);
  const sortedArticles = [...(articles ?? [])].sort((a, b) =>
    compareArticlePath(String(a.path), String(b.path)),
  );

  // feat-4-A-340 — node-pinned 우선 + 조문 파생으로 배치된 문제만 fetch.
  const placedIds = (
    await fetchPlacedProblemRows(client, subtreeIds, articleIds)
  ).map((p) => p.problem_id);
  const { data: problemRows } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, importance, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, model_answer_md, grading_rubric_md, video_url, subjective_kind, subjective_keywords, subjective_topic, rubric_items, articles!primary_article_id(article_number, display_label)",
    )
    .in("problem_id", placedIds)
    .is("deleted_at", null);

  const problemList = problemRows ?? [];
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
  for (const a of sortedArticles) {
    const probs = problemList
      .filter((p) => p.primary_article_id === a.article_id)
      .map<ProblemDetail>((p) => ({
        problemId: p.problem_id,
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
      }))
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
    .select("node_id, path")
    .eq("law_code", node.law_code);
  const nodePath = String(node.path);
  const subtreeIds = (subtreeNodes ?? [])
    .filter(
      (n) =>
        String(n.path) === nodePath ||
        String(n.path).startsWith(nodePath + "."),
    )
    .map((n) => n.node_id);

  const { data: links } = await client
    .from("article_systematic_links")
    .select("article_id")
    .in("node_id", subtreeIds);
  const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
  if (articleIds.length === 0) {
    return {
      node: {
        nodeId: node.node_id,
        path: nodePath,
        displayLabel: node.display_label,
      },
      problems: [],
    };
  }

  const { data: articles } = await client
    .from("articles")
    .select("article_id, display_label, path")
    .in("article_id", articleIds);
  const sortedArticles = [...(articles ?? [])].sort((a, b) =>
    compareArticlePath(String(a.path), String(b.path)),
  );

  // feat-4-A-340 — node-pinned 우선 + 조문 파생. primary_article_id 로 그룹.
  const list = await fetchPlacedProblemRows(client, subtreeIds, articleIds);

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

  // 1) 노드 ↔ 조문 링크 (node_id IN — 필요 시 150개 chunk).
  const nodeIds = nodes.map((n) => n.node_id);
  const links: { node_id: string; article_id: string }[] = [];
  for (let i = 0; i < nodeIds.length; i += 150) {
    const { data } = await client
      .from("article_systematic_links")
      .select("node_id, article_id")
      .in("node_id", nodeIds.slice(i, i + 150));
    for (const r of data ?? []) links.push(r);
  }

  // 2) 링크된 조문의 문제 (primary_article_id 기준) + primary_node_id 동반 fetch.
  const articleIds = [...new Set(links.map((l) => l.article_id))];
  const probRows: {
    problem_id: string;
    primary_article_id: string | null;
    primary_node_id: string | null;
    year: number | null;
    problem_number: number | null;
    importance: number | null;
  }[] = [];
  for (let i = 0; i < articleIds.length; i += 150) {
    const { data } = await client
      .from("problems")
      .select(
        "problem_id, primary_article_id, primary_node_id, year, problem_number, importance",
      )
      .in("primary_article_id", articleIds.slice(i, i + 150))
      .is("deleted_at", null);
    for (const r of data ?? []) probRows.push(r);
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
  origin: Database["public"]["Enums"]["problem_origin"];
}
export async function getAdjacentProblems(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<{ prev: AdjacentProblem | null; next: AdjacentProblem | null }> {
  const { data: cur } = await client
    .from("problems")
    .select("law_id, year, problem_number")
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur || !cur.law_id) return { prev: null, next: null };
  const { data: rows } = await client
    .from("problems")
    .select("problem_id, year, problem_number, origin")
    .eq("law_id", cur.law_id)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
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

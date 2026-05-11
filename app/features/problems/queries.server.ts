import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  getBookmarksByTargets,
  listMemosByTargets,
} from "~/features/annotations/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import { articleSlug } from "~/features/laws/lib/identifier";
import type {
  OxQuestionItem,
  OxRefAnnotations,
  OxTruth,
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

import type {
  ProblemDetail,
  ProblemListItem,
  ProblemOrigin,
  ProblemFormat,
  ProblemPolarity,
  ProblemScope,
} from "./labels";

export interface ListProblemsFilters {
  origin?: ProblemOrigin;
  format?: ProblemFormat;
  polarity?: ProblemPolarity;
  scope?: ProblemScope;
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
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, articles!primary_article_id(article_number, display_label, path)",
    )
    .eq("law_id", law.law_id)
    .is("deleted_at", null);

  if (filters.origin) query = query.eq("origin", filters.origin);
  if (filters.format) query = query.eq("format", filters.format);
  if (filters.polarity) query = query.eq("polarity", filters.polarity);
  if (filters.scope) query = query.eq("scope", filters.scope);
  if (filters.year != null) query = query.eq("year", filters.year);
  if (filters.search && filters.search.trim().length > 0) {
    // PostgREST .ilike() — % 와 _ 만 와일드카드로 escape 후 양쪽 % 추가.
    const safe = filters.search
      .trim()
      .replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike("body_md", `%${safe}%`);
  }
  if (filters.primaryArticleId)
    query = query.eq("primary_article_id", filters.primaryArticleId);
  if (filters.reviewStatus === "reviewed") query = query.not("reviewed_at", "is", null);
  else if (filters.reviewStatus === "pending") query = query.is("reviewed_at", null);
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
  const mediaByProblem = new Map<string, { hasTable: boolean; hasImage: boolean }>();
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
    const allChoiceRows: Array<{ problem_id: string; choice_type: string | null; explanation_md: string | null }> = [];
    const allBoxRows: Array<{ problem_id: string; explanation_md: string | null }> = [];
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
    const m = mediaByProblem.get(row.problem_id) ?? { hasTable: false, hasImage: false };
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
      primaryArticleId: row.primary_article_id,
      primaryArticleNumber: row.articles?.article_number ?? null,
      primaryArticleLabel: row.articles?.display_label ?? null,
      unclassifiedChoices: unclassifiedByProblem.get(row.problem_id) ?? 0,
      reviewedAt: row.reviewed_at,
      mismatchFlaggedAt: row.mismatch_flagged_at,
      explanationMd: row.explanation_md,
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
    rows.map((r) => [r.problem_id, r.articles?.path ? String(r.articles.path) : null]),
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
    if ((b.year ?? 0) !== (a.year ?? 0))
      return (b.year ?? 0) - (a.year ?? 0);
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
}

export async function listRecentProblems(
  client: SupabaseClient<Database>,
  limit = 50,
  formatFilter: "mcq" | "subjective" = "mcq",
): Promise<RecentProblemItem[]> {
  const formats: ProblemFormat[] =
    formatFilter === "mcq"
      ? ["mc_short", "mc_box", "mc_case", "ox", "blank"]
      : ["subjective"];
  const { data, error } = await client
    .from("problems")
    .select(
      "problem_id, body_md, format, origin, year, problem_number, created_at, laws!inner(law_code)",
    )
    .in("format", formats)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    problemId: r.problem_id,
    bodySnippet:
      (r.body_md ?? "").length > 100
        ? `${(r.body_md ?? "").slice(0, 100)}…`
        : r.body_md ?? "",
    format: r.format,
    origin: r.origin,
    year: r.year,
    problemNumber: r.problem_number,
    createdAt: r.created_at,
    lawCode: r.laws.law_code,
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
      return it.oxIneligible === false && it.oxTruth != null && it.relatedArticleId != null;
    }
    if (status === "ineligible") {
      return it.oxIneligible === true;
    }
    if (status === "untruthed") {
      return !it.oxIneligible && (it.oxTruth == null || it.relatedArticleId == null);
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
    ineligible === true ? null : patch.oxTruth === undefined ? undefined : patch.oxTruth;

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

// 과목 전체 OX 가능 지문 — /subjects/:subject/ox 풀이용. 셔플은 클라에서.
export async function getOxQuestionsForSubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  limit = 200,
): Promise<OxQuestionItem[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  const out: OxQuestionItem[] = [];

  const { data: choiceRows } = await client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at, law_id)",
    )
    .eq("problems.law_id", law.law_id)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    .limit(limit);
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
): Promise<OxQuestionItem[]> {
  const out: OxQuestionItem[] = [];

  // 1. problem_choices.
  const { data: choiceRows } = await client
    .from("problem_choices")
    .select(
      "choice_id, problem_id, body_md, ox_truth, explanation_md, problems!inner(year, problem_number, origin, deleted_at)",
    )
    .eq("related_article_id", articleId)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    .limit(limit);
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

  // 2. problem_box_items (박스형 사례 지문).
  const { data: boxRows } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, problem_id, body_md, ox_truth, explanation_md, marker, problems!inner(year, problem_number, origin, deleted_at)",
    )
    .eq("related_article_id", articleId)
    .eq("ox_ineligible", false)
    .not("ox_truth", "is", null)
    .limit(limit);
  for (const r of boxRows ?? []) {
    if (r.problems.deleted_at) continue;
    out.push({
      refType: "box",
      refId: r.box_item_id,
      problemId: r.problem_id,
      bodyMd: r.marker ? `[${r.marker}] ${r.body_md}` : r.body_md,
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
    { articleId: string; lawCode: string; pathSlug: string; displayLabel: string }
  >;
  cases: Map<string, { caseId: string; lawCode: string; caseNumber: string; caseTitle: string }>;
}

export async function getChoiceLinkRefs(
  client: SupabaseClient<Database>,
  articleIds: string[],
  caseIds: string[],
): Promise<ChoiceLinkRefs> {
  const articleMap = new Map<
    string,
    { articleId: string; lawCode: string; pathSlug: string; displayLabel: string }
  >();
  const caseMap = new Map<
    string,
    { caseId: string; lawCode: string; caseNumber: string; caseTitle: string }
  >();

  if (articleIds.length > 0) {
    const unique = Array.from(new Set(articleIds));
    const { data: rows } = await client
      .from("articles")
      .select(
        "article_id, article_number, display_label, laws!inner(law_code)",
      )
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
        : r.body_md ?? "",
    format: r.format,
    origin: r.origin,
    lawCode: r.laws.law_code,
  }));
}

export async function getProblemById(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemDetail | null> {
  const { data: problem, error } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, law_id, reviewed_at, mismatch_flagged_at, explanation_md, articles!primary_article_id(article_number, display_label)",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!problem) return null;

  const { data: choices, error: cErr } = await client
    .from("problem_choices")
    .select(
      "choice_id, choice_index, body_md, is_correct, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
    )
    .eq("problem_id", problemId)
    .order("choice_index");
  if (cErr) throw cErr;
  const choiceList = choices ?? [];

  const { data: boxRows } = await client
    .from("problem_box_items")
    .select(
      "box_item_id, position_index, marker, body_md, explanation_md, choice_type, related_article_id, related_article_number, related_case_id, related_case_number, ox_ineligible, ox_truth",
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
      oxIneligible: b.ox_ineligible,
      oxTruth: b.ox_truth,
    })),
  };
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
      .filter((n) => String(n.path) === topPath || String(n.path).startsWith(topPath + "."))
      .map((n) => n.node_id);
    if (subtreeNodeIds.length === 0) {
      result.push({
        nodeId: top.node_id,
        path: topPath,
        displayLabel: top.display_label,
        ord: top.ord,
        problemCount: 0,
      });
      continue;
    }
    const { data: links } = await client
      .from("article_systematic_links")
      .select("article_id")
      .in("node_id", subtreeNodeIds);
    const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
    if (articleIds.length === 0) {
      result.push({
        nodeId: top.node_id,
        path: topPath,
        displayLabel: top.display_label,
        ord: top.ord,
        problemCount: 0,
      });
      continue;
    }
    const { count } = await client
      .from("problems")
      .select("problem_id", { count: "exact", head: true })
      .in("primary_article_id", articleIds)
      .is("deleted_at", null);
    result.push({
      nodeId: top.node_id,
      path: topPath,
      displayLabel: top.display_label,
      ord: top.ord,
      problemCount: count ?? 0,
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
  emptyArticles: Array<{ articleId: string; articleNumber: string | null; articleLabel: string }>;
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
      (n) => String(n.path) === nodePath || String(n.path).startsWith(nodePath + "."),
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
      node: { nodeId: node.node_id, path: nodePath, displayLabel: node.display_label },
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

  // 모든 문제 한번에 fetch.
  const { data: problemRows } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, reviewed_at, mismatch_flagged_at, explanation_md, articles!primary_article_id(article_number, display_label)",
    )
    .in("primary_article_id", articleIds)
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
        hasTable:
          hasTableMd(p.explanation_md) ||
          (choicesByProblem.get(p.problem_id) ?? []).some((c) => hasTableMd(c.explanationMd)) ||
          (boxItemsByProblem.get(p.problem_id) ?? []).some((b) => hasTableMd(b.explanationMd)),
        hasImage:
          hasImageMd(p.explanation_md) ||
          (choicesByProblem.get(p.problem_id) ?? []).some((c) => hasImageMd(c.explanationMd)) ||
          (boxItemsByProblem.get(p.problem_id) ?? []).some((b) => hasImageMd(b.explanationMd)),
        choices: choicesByProblem.get(p.problem_id) ?? [],
        boxItems: boxItemsByProblem.get(p.problem_id) ?? [],
      }))
      .sort((x, y) => {
        if ((y.year ?? 0) !== (x.year ?? 0)) return (y.year ?? 0) - (x.year ?? 0);
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
    node: { nodeId: node.node_id, path: nodePath, displayLabel: node.display_label },
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
      (n) => String(n.path) === nodePath || String(n.path).startsWith(nodePath + "."),
    )
    .map((n) => n.node_id);

  const { data: links } = await client
    .from("article_systematic_links")
    .select("article_id")
    .in("node_id", subtreeIds);
  const articleIds = [...new Set((links ?? []).map((l) => l.article_id))];
  if (articleIds.length === 0) {
    return {
      node: { nodeId: node.node_id, path: nodePath, displayLabel: node.display_label },
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

  const { data: problemRows } = await client
    .from("problems")
    .select("problem_id, primary_article_id, year, problem_number")
    .in("primary_article_id", articleIds)
    .is("deleted_at", null);
  const list = problemRows ?? [];

  const problems: NodeProblemSequence["problems"] = [];
  for (const a of sortedArticles) {
    const inArticle = list
      .filter((p) => p.primary_article_id === a.article_id)
      .sort((x, y) => {
        if ((y.year ?? 0) !== (x.year ?? 0)) return (y.year ?? 0) - (x.year ?? 0);
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
    node: { nodeId: node.node_id, path: nodePath, displayLabel: node.display_label },
    problems,
  };
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

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
  // 특정 조문에 연결된 문제만.
  primaryArticleId?: string;
  // 분류되지 않은 choice 가 1개 이상인 문제만 (운영자 보강 대기열).
  hasUnclassified?: boolean;
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
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, articles!primary_article_id(article_number, display_label, path)",
    )
    .eq("law_id", law.law_id)
    .is("deleted_at", null);

  if (filters.origin) query = query.eq("origin", filters.origin);
  if (filters.format) query = query.eq("format", filters.format);
  if (filters.polarity) query = query.eq("polarity", filters.polarity);
  if (filters.scope) query = query.eq("scope", filters.scope);
  if (filters.year != null) query = query.eq("year", filters.year);
  if (filters.primaryArticleId)
    query = query.eq("primary_article_id", filters.primaryArticleId);

  const { data, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error) throw error;
  const rows = data ?? [];

  // unclassified choice 카운트 — 1번 batch.
  const problemIds = rows.map((r) => r.problem_id);
  const unclassifiedByProblem = new Map<string, number>();
  if (problemIds.length > 0) {
    const { data: choiceRows } = await client
      .from("problem_choices")
      .select("problem_id, choice_type")
      .in("problem_id", problemIds);
    for (const c of choiceRows ?? []) {
      if (c.choice_type === null) {
        unclassifiedByProblem.set(
          c.problem_id,
          (unclassifiedByProblem.get(c.problem_id) ?? 0) + 1,
        );
      }
    }
  }

  let mapped: ProblemListItem[] = rows.map((row) => ({
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
  }));

  if (filters.hasUnclassified) {
    mapped = mapped.filter((p) => p.unclassifiedChoices > 0);
  }

  // 정렬 — articles.path 가 있으면 ltree 사전순 (자연 정렬). 없는 문제는 끝에.
  // path 비교는 string 비교로 OK (ltree text rep).
  const pathOf = (r: (typeof rows)[number]) =>
    r.articles?.path ? String(r.articles.path) : "~~~~~";
  const pathByProblem = new Map(rows.map((r) => [r.problem_id, pathOf(r)]));
  mapped.sort((a, b) => {
    const pa = pathByProblem.get(a.problemId) ?? "~~~~~";
    const pb = pathByProblem.get(b.problemId) ?? "~~~~~";
    if (pa !== pb) return pa < pb ? -1 : 1;
    if ((b.year ?? 0) !== (a.year ?? 0))
      return (b.year ?? 0) - (a.year ?? 0);
    return (a.problemNumber ?? 0) - (b.problemNumber ?? 0);
  });

  return mapped;
}

export async function getProblemById(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemDetail | null> {
  const { data: problem, error } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, law_id, articles!primary_article_id(article_number, display_label)",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!problem) return null;

  const { data: choices, error: cErr } = await client
    .from("problem_choices")
    .select(
      "choice_id, choice_index, body_md, is_correct, explanation_md, choice_type, related_article_id, related_case_id",
    )
    .eq("problem_id", problemId)
    .order("choice_index");
  if (cErr) throw cErr;
  const choiceList = choices ?? [];

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
    unclassifiedChoices: choiceList.filter((c) => c.choice_type === null)
      .length,
    choices: choiceList.map((c) => ({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
      choiceType: c.choice_type,
      relatedArticleId: c.related_article_id,
      relatedCaseId: c.related_case_id,
    })),
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type {
  ProblemExamRound,
  ProblemFormat,
  ProblemOrigin,
  ProblemPolarity,
  ProblemScope,
  ProblemListItem,
  ProblemChoice,
  ProblemDetail,
} from "./labels";
export { FORMAT_LABEL, ORIGIN_LABEL, POLARITY_LABEL, SCOPE_LABEL } from "./labels";

import type {
  ProblemListItem,
  ProblemDetail,
} from "./labels";

export async function listProblemsBySubject(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<ProblemListItem[]> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  const { data, error } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id",
    )
    .eq("law_id", law.law_id)
    .is("deleted_at", null)
    .order("year", { ascending: false, nullsFirst: false })
    .order("problem_number", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
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
  }));
}

export async function getProblemById(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemDetail | null> {
  const { data: problem, error } = await client
    .from("problems")
    .select(
      "problem_id, exam_round, format, origin, polarity, scope, year, exam_round_no, problem_number, body_md, primary_article_id, law_id",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!problem) return null;

  const { data: choices, error: cErr } = await client
    .from("problem_choices")
    .select(
      "choice_id, choice_index, body_md, is_correct, explanation_md, related_article_id, related_case_id",
    )
    .eq("problem_id", problemId)
    .order("choice_index");
  if (cErr) throw cErr;

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
    choices: (choices ?? []).map((c) => ({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
      relatedArticleId: c.related_article_id,
      relatedCaseId: c.related_case_id,
    })),
  };
}

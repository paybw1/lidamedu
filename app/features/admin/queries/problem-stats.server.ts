// 운영자 문제 통계 — RPC 래퍼.
// SQL 정의: 마이그레이션 admin_problem_stats_rpcs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface ProblemSummary {
  mcq: {
    problemCount: number;
    attemptCount: number;
    correctCount: number;
    accuracy: number; // 0~100
    uniqueUsers: number;
  };
  ox: {
    refTotal: number;
    refActive: number; // 학생에게 노출되는 OX 후보 수.
    attemptCount: number;
    correctCount: number;
    accuracy: number;
    uniqueUsers: number;
  };
}

export async function getProblemSummary(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<ProblemSummary> {
  const { data, error } = await client.rpc("admin_problem_summary", {
    p_law_code: lawCode,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) {
    return {
      mcq: {
        problemCount: 0,
        attemptCount: 0,
        correctCount: 0,
        accuracy: 0,
        uniqueUsers: 0,
      },
      ox: {
        refTotal: 0,
        refActive: 0,
        attemptCount: 0,
        correctCount: 0,
        accuracy: 0,
        uniqueUsers: 0,
      },
    };
  }
  const mcqAcc =
    Number(row.mcq_attempt_count) > 0
      ? (Number(row.mcq_correct_count) / Number(row.mcq_attempt_count)) * 100
      : 0;
  const oxAcc =
    Number(row.ox_attempt_count) > 0
      ? (Number(row.ox_correct_count) / Number(row.ox_attempt_count)) * 100
      : 0;
  return {
    mcq: {
      problemCount: Number(row.mcq_problem_count ?? 0),
      attemptCount: Number(row.mcq_attempt_count ?? 0),
      correctCount: Number(row.mcq_correct_count ?? 0),
      accuracy: Math.round(mcqAcc * 10) / 10,
      uniqueUsers: Number(row.mcq_unique_users ?? 0),
    },
    ox: {
      refTotal: Number(row.ox_ref_total ?? 0),
      refActive: Number(row.ox_ref_active ?? 0),
      attemptCount: Number(row.ox_attempt_count ?? 0),
      correctCount: Number(row.ox_correct_count ?? 0),
      accuracy: Math.round(oxAcc * 10) / 10,
      uniqueUsers: Number(row.ox_unique_users ?? 0),
    },
  };
}

export interface McqProblemStat {
  problemId: string;
  problemNumber: number | null;
  year: number | null;
  origin: string;
  bodySnippet: string;
  primaryArticleLabel: string | null;
  primaryArticleNumber: string | null;
  attempts: number;
  correctCount: number;
  accuracy: number;
  uniqueUsers: number;
}

export async function listMcqHardestProblems(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  minAttempts = 1,
  limit = 30,
): Promise<McqProblemStat[]> {
  const { data, error } = await client.rpc("admin_mcq_problem_stats", {
    p_law_code: lawCode,
    p_min_attempts: minAttempts,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    problemId: r.problem_id,
    problemNumber: r.problem_number,
    year: r.year,
    origin: r.origin,
    bodySnippet:
      (r.body_md ?? "").length > 140
        ? `${(r.body_md ?? "").slice(0, 140)}…`
        : (r.body_md ?? ""),
    primaryArticleLabel: r.primary_article_label,
    primaryArticleNumber: r.primary_article_number,
    attempts: Number(r.attempts ?? 0),
    correctCount: Number(r.correct_count ?? 0),
    accuracy: Number(r.accuracy ?? 0),
    uniqueUsers: Number(r.unique_users ?? 0),
  }));
}

export interface OxRefStat {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  problemNumber: number | null;
  year: number | null;
  origin: string;
  bodySnippet: string;
  oxTruth: string;
  relatedArticleLabel: string | null;
  relatedArticleNumber: string | null;
  attempts: number;
  correctCount: number;
  accuracy: number;
  uniqueUsers: number;
}

export async function listOxHardestRefs(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  minAttempts = 1,
  limit = 30,
): Promise<OxRefStat[]> {
  const { data, error } = await client.rpc("admin_ox_ref_stats", {
    p_law_code: lawCode,
    p_min_attempts: minAttempts,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    refType: (r.ref_type === "box" ? "box" : "choice") as "choice" | "box",
    refId: r.ref_id,
    problemId: r.problem_id,
    problemNumber: r.problem_number,
    year: r.year,
    origin: r.origin,
    bodySnippet:
      (r.body_md ?? "").length > 140
        ? `${(r.body_md ?? "").slice(0, 140)}…`
        : (r.body_md ?? ""),
    oxTruth: r.ox_truth,
    relatedArticleLabel: r.related_article_label,
    relatedArticleNumber: r.related_article_number,
    attempts: Number(r.attempts ?? 0),
    correctCount: Number(r.correct_count ?? 0),
    accuracy: Number(r.accuracy ?? 0),
    uniqueUsers: Number(r.unique_users ?? 0),
  }));
}

export interface McqYearStat {
  year: number;
  attempts: number;
  correctCount: number;
  accuracy: number;
  problemCount: number;
}

export async function listMcqYearStats(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<McqYearStat[]> {
  const { data, error } = await client.rpc("admin_mcq_year_stats", {
    p_law_code: lawCode,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    year: Number(r.year),
    attempts: Number(r.attempts ?? 0),
    correctCount: Number(r.correct_count ?? 0),
    accuracy: Number(r.accuracy ?? 0),
    problemCount: Number(r.problem_count ?? 0),
  }));
}

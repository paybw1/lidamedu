// 자연과학 단원/문제 서버 쿼리.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type ScienceSection,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

export interface ScienceProblem {
  problemId: string;
  scienceSubject: ScienceSubjectSlug;
  scienceSectionId: string | null;
  bodyMd: string;
  totalPoints: number;
}

// 자연과학 문제 풀이 후보 — 단원 필터 옵션.
// sectionIds null/빈 배열 = 과목 내 전체.
export async function listScienceProblems(
  client: SupabaseClient<Database>,
  scienceSubject: ScienceSubjectSlug,
  sectionIds: string[] = [],
): Promise<ScienceProblem[]> {
  let q = client
    .from("problems")
    .select("problem_id, science_subject, science_section_id, body_md, total_points")
    .eq("subject_type", "science")
    .eq("science_subject", scienceSubject)
    .is("deleted_at", null);
  if (sectionIds.length > 0) q = q.in("science_section_id", sectionIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    problemId: r.problem_id,
    scienceSubject: r.science_subject as ScienceSubjectSlug,
    scienceSectionId: r.science_section_id,
    bodyMd: r.body_md,
    totalPoints: r.total_points ?? 1,
  }));
}

// 문제 + 선지 (viewer 용).
export interface ScienceProblemDetail {
  problemId: string;
  scienceSubject: ScienceSubjectSlug;
  scienceSectionId: string | null;
  bodyMd: string;
  totalPoints: number;
  choices: {
    choiceId: string;
    choiceIndex: number;
    bodyMd: string;
    isCorrect: boolean;
    explanationMd: string | null;
  }[];
}

export async function getScienceProblem(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ScienceProblemDetail | null> {
  const { data: p, error } = await client
    .from("problems")
    .select(
      "problem_id, science_subject, science_section_id, body_md, total_points, subject_type",
    )
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!p || p.subject_type !== "science") return null;

  const { data: cs, error: csErr } = await client
    .from("problem_choices")
    .select("choice_id, choice_index, body_md, is_correct, explanation_md")
    .eq("problem_id", problemId)
    .order("choice_index", { ascending: true });
  if (csErr) throw csErr;

  return {
    problemId: p.problem_id,
    scienceSubject: p.science_subject as ScienceSubjectSlug,
    scienceSectionId: p.science_section_id,
    bodyMd: p.body_md,
    totalPoints: p.total_points ?? 1,
    choices: (cs ?? []).map((c) => ({
      choiceId: c.choice_id,
      choiceIndex: c.choice_index,
      bodyMd: c.body_md,
      isCorrect: c.is_correct,
      explanationMd: c.explanation_md,
    })),
  };
}

// 사용자의 자연과학 진척도 — 풀이 수, 정답 수.
export async function getScienceProgress(
  client: SupabaseClient<Database>,
  userId: string,
  scienceSubject: ScienceSubjectSlug,
): Promise<{ attempted: number; correct: number; total: number }> {
  // 단원/문제 총합.
  const { count: total } = await client
    .from("problems")
    .select("problem_id", { count: "exact", head: true })
    .eq("subject_type", "science")
    .eq("science_subject", scienceSubject)
    .is("deleted_at", null);

  // 사용자 시도 — 같은 문제 여러 번 시도해도 distinct 로 세기.
  const { data: attempts } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, problems!inner(science_subject, subject_type)")
    .eq("user_id", userId)
    .eq("problems.subject_type", "science")
    .eq("problems.science_subject", scienceSubject);

  const attemptedSet = new Set<string>();
  const correctSet = new Set<string>();
  for (const a of attempts ?? []) {
    attemptedSet.add(a.problem_id);
    if (a.is_correct) correctSet.add(a.problem_id);
  }

  return {
    attempted: attemptedSet.size,
    correct: correctSet.size,
    total: total ?? 0,
  };
}

// 한 과목의 단원 목록 + 단원별 문제 수.
export async function listSectionsWithCounts(
  client: SupabaseClient<Database>,
  subject: ScienceSubjectSlug,
): Promise<ScienceSection[]> {
  const { data: sections, error } = await client
    .from("science_sections")
    .select("*")
    .eq("science_subject", subject)
    .order("order_index", { ascending: true });
  if (error) throw error;

  const sectionIds = (sections ?? []).map((s) => s.section_id);
  const counts = new Map<string, number>();
  if (sectionIds.length > 0) {
    const { data: rows } = await client
      .from("problems")
      .select("science_section_id")
      .eq("subject_type", "science")
      .eq("science_subject", subject)
      .is("deleted_at", null)
      .in("science_section_id", sectionIds);
    for (const r of rows ?? []) {
      if (r.science_section_id) {
        counts.set(
          r.science_section_id,
          (counts.get(r.science_section_id) ?? 0) + 1,
        );
      }
    }
  }

  return (sections ?? []).map((s) => ({
    sectionId: s.section_id,
    scienceSubject: s.science_subject as ScienceSubjectSlug,
    parentId: s.parent_id,
    orderIndex: s.order_index,
    code: s.code,
    label: s.label,
    descriptionMd: s.description_md,
    problemCount: counts.get(s.section_id) ?? 0,
  }));
}

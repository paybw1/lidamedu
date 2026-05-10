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

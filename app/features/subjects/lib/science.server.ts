// 자연과학 단원 서버 쿼리.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type ScienceSection,
  type ScienceSubjectSlug,
} from "~/features/subjects/lib/science";

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

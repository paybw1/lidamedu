// feat-6-005 콘텐츠 인용 marker — 서버 측 lookup.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type ContentRef,
  type ResolvedRefMap,
  EMPTY_REF_MAP,
  extractContentRefs,
} from "./content-refs";

/** 여러 본문(post + comments) 에서 ref 모두 추출 후 일괄 lookup. */
export async function resolveRefsForBodies(
  client: SupabaseClient<Database>,
  bodies: string[],
): Promise<ResolvedRefMap> {
  const allRefs: ContentRef[] = [];
  for (const b of bodies) allRefs.push(...extractContentRefs(b));
  if (allRefs.length === 0) return EMPTY_REF_MAP;

  const lawKeys = new Set<string>();
  const caseKeys = new Set<string>();
  const problemKeys = new Set<string>();
  for (const r of allRefs) {
    if (r.kind === "law") lawKeys.add(r.key);
    else if (r.kind === "case") caseKeys.add(r.key);
    else if (r.kind === "problem") problemKeys.add(r.key);
  }

  const result: ResolvedRefMap = { law: {}, case: {}, problem: {} };

  // 1) law — (lawCode, articleNumber) 매칭.
  if (lawKeys.size > 0) {
    const articleNumbers = [...new Set([...lawKeys].map((k) => k.split("|")[1]))];
    const { data: articles } = await client
      .from("articles")
      .select(
        "article_number, display_label, laws!inner(law_code)",
      )
      .in("article_number", articleNumbers)
      .eq("level", "article")
      .is("deleted_at", null);
    for (const a of articles ?? []) {
      if (!a.article_number) continue;
      const lawCode = a.laws.law_code as string;
      const key = `${lawCode}|${a.article_number}`;
      if (!lawKeys.has(key)) continue;
      result.law[key] = {
        lawCode,
        articleNumber: a.article_number,
        displayLabel: a.display_label,
        url: `/subjects/${lawCode}/articles/${a.article_number}`,
      };
    }
  }

  // 2) case — case_number 정확 매칭.
  if (caseKeys.size > 0) {
    const { data: cases } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_number", [...caseKeys])
      .is("deleted_at", null);
    for (const c of cases ?? []) {
      const lawCode = (c.subject_laws?.[0] as string | undefined) ?? "patent";
      result.case[c.case_number] = {
        caseId: c.case_id,
        caseNumber: c.case_number,
        caseTitle: c.case_title,
        lawCode,
        url: `/subjects/${lawCode}/cases/${c.case_id}`,
      };
    }
  }

  // 3) problem — UUID 매칭.
  if (problemKeys.size > 0) {
    const { data: problems } = await client
      .from("problems")
      .select(
        "problem_id, body_md, year, problem_number, laws!inner(law_code)",
      )
      .in("problem_id", [...problemKeys])
      .is("deleted_at", null);
    for (const p of problems ?? []) {
      const lawCode = (p.laws.law_code as string) ?? "patent";
      result.problem[p.problem_id] = {
        problemId: p.problem_id,
        lawCode,
        year: p.year,
        problemNumber: p.problem_number,
        bodySnippet: (p.body_md ?? "").slice(0, 100),
        url: `/subjects/${lawCode}/problems/${p.problem_id}`,
      };
    }
  }

  return result;
}

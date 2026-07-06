// AI 답변 출처(citations) → 학생 뷰어 href 해소.
// citation.sourceId 는 원본 엔티티 PK(article_id/case_id/problem_id) — 조문은
// URL 에 law_code + article_number 가 필요해 일괄 재조회한다. textbook/practice
// (2차 자료)는 뷰어 라우트가 없어 링크하지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { scienceProblemHref } from "~/features/subjects/lib/science";

import type { CitationHrefMap, QnaMessage } from "../labels";

export type { CitationHrefMap } from "../labels";

export async function resolveCitationHrefs(
  client: SupabaseClient<Database>,
  messages: ReadonlyArray<QnaMessage>,
): Promise<CitationHrefMap> {
  const articleIds = new Set<string>();
  const caseIds = new Set<string>();
  const problemIds = new Set<string>();
  for (const m of messages) {
    for (const c of m.citations) {
      if (c.sourceType === "article") articleIds.add(c.sourceId);
      else if (c.sourceType === "case") caseIds.add(c.sourceId);
      else if (c.sourceType === "problem") problemIds.add(c.sourceId);
    }
  }

  const out: CitationHrefMap = {};
  const [articles, cases, problems] = await Promise.all([
    articleIds.size > 0
      ? client
          .from("articles")
          .select("article_id, article_number, laws(law_code)")
          .in("article_id", [...articleIds])
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    caseIds.size > 0
      ? client
          .from("cases")
          .select("case_id, subject_laws")
          .in("case_id", [...caseIds])
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    problemIds.size > 0
      ? client
          .from("problems")
          .select("problem_id, science_subject, laws(law_code)")
          .in("problem_id", [...problemIds])
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);

  for (const a of articles) {
    const law = a.laws?.law_code;
    if (law && a.article_number) {
      out[`article:${a.article_id}`] =
        `/subjects/${law}/articles/${a.article_number}`;
    }
  }
  for (const c of cases) {
    const law = Array.isArray(c.subject_laws) ? c.subject_laws[0] : null;
    if (law) out[`case:${c.case_id}`] = `/subjects/${law}/cases/${c.case_id}`;
  }
  for (const p of problems) {
    if (p.science_subject) {
      out[`problem:${p.problem_id}`] = scienceProblemHref(
        p.science_subject,
        p.problem_id,
      );
    } else if (p.laws?.law_code) {
      out[`problem:${p.problem_id}`] =
        `/subjects/${p.laws.law_code}/problems/${p.problem_id}`;
    }
  }
  return out;
}

// 사람이 읽는 식별자(조문번호 / 판례번호 / 과목·차수·년도·번호) → Q&A target_id 해석.
// 커뮤니티 Q&A 대상 선택기에서 사용. 상세패널 질문과 동일한 target_type+target_id 를
// 만들어주는 게 목적 — 해석 실패 시 null.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  getArticleByNumber,
  getLawByCode,
} from "~/features/laws/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { QnaTargetType } from "../labels";
import {
  articleHref,
  caseHref,
  problemDisplayLabel,
  problemHref,
  type TargetDisplay,
} from "./target-display.server";

export interface ResolvedTarget extends TargetDisplay {
  targetType: QnaTargetType;
  targetId: string;
}

// 조문·판례·문제 대상은 법률과목만(자연과학은 조문/판례 없음, 문제는 후속).
const LAW_SUBJECTS: readonly string[] = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
];
function asLawSubject(subject: string): LawSubjectSlug | null {
  return LAW_SUBJECTS.includes(subject) ? (subject as LawSubjectSlug) : null;
}

// "제29조의2" / "29조" / "29의2" → "29의2" (articles.article_number 표기와 정합).
function normalizeArticleNumber(input: string): string {
  return input
    .replace(/제/g, "")
    .replace(/조/g, "")
    .replace(/\s/g, "")
    .trim();
}

export async function resolveArticleTarget(
  client: SupabaseClient<Database>,
  subject: string,
  articleNumberInput: string,
): Promise<ResolvedTarget | null> {
  const lawCode = asLawSubject(subject);
  if (!lawCode) return null;
  const num = normalizeArticleNumber(articleNumberInput);
  if (!num) return null;
  const law = await getLawByCode(client, lawCode);
  if (!law) return null;
  const article = await getArticleByNumber(client, law.lawId, num);
  if (!article) return null;
  return {
    targetType: "article",
    targetId: article.articleId,
    label: `${law.shortLabel} ${article.displayLabel}`,
    href: articleHref(lawCode, article.articleNumber),
  };
}

export async function resolveCaseTarget(
  client: SupabaseClient<Database>,
  caseNumberInput: string,
): Promise<ResolvedTarget | null> {
  const caseNumber = caseNumberInput.trim();
  if (!caseNumber) return null;
  const { data, error } = await client
    .from("cases")
    .select("case_id, case_number, subject_laws")
    .eq("case_number", caseNumber)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const lawCode = row.subject_laws?.[0] ?? null;
  return {
    targetType: "case",
    targetId: row.case_id,
    label: row.case_number,
    href: caseHref(lawCode, row.case_id),
  };
}

export async function resolveProblemTarget(
  client: SupabaseClient<Database>,
  args: {
    subject: string;
    examRound: Database["public"]["Enums"]["problem_exam_round"];
    year: number;
    problemNumber: number;
    origin?: Database["public"]["Enums"]["problem_origin"];
  },
): Promise<ResolvedTarget | null> {
  const lawCode = asLawSubject(args.subject);
  if (!lawCode) return null;
  const law = await getLawByCode(client, lawCode);
  if (!law) return null;
  const origin = args.origin ?? "past_exam";
  const { data, error } = await client
    .from("problems")
    .select("problem_id, year, exam_round, problem_number, origin")
    .eq("law_id", law.lawId)
    .eq("exam_round", args.examRound)
    .eq("year", args.year)
    .eq("problem_number", args.problemNumber)
    .eq("origin", origin)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    targetType: "problem",
    targetId: row.problem_id,
    label: problemDisplayLabel({
      shortLabel: law.shortLabel,
      year: row.year,
      examRound: row.exam_round,
      problemNumber: row.problem_number,
      origin: row.origin,
    }),
    href: problemHref(lawCode, row.problem_id),
  };
}

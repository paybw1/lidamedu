// Q&A 대상(article/case/problem) 단위로 표시용 라벨 + 진입 URL 을 만들어주는 헬퍼.
// 실패해도 Q&A 동작은 영향 없도록 null 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { QnaTargetType } from "../labels";

export interface TargetDisplay {
  label: string;
  href: string | null;
}

type ProblemExamRound = Database["public"]["Enums"]["problem_exam_round"];
type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];

// ── 순수 라벨/링크 빌더 (target-resolve 와 공유 — SSOT) ──
export function problemDisplayLabel(args: {
  shortLabel: string;
  year: number | null;
  examRound: ProblemExamRound;
  problemNumber: number | null;
  origin: ProblemOrigin;
}): string {
  const round = args.examRound === "second" ? "2차" : "1차";
  const originSuffix =
    args.origin === "past_exam_variant"
      ? " (변형)"
      : args.origin === "expected"
        ? " (예상)"
        : args.origin === "mock"
          ? " (모의)"
          : args.origin === "ai_draft"
            ? " (초안)"
            : "";
  const yearPart = args.year ? `${args.year}년 ` : "";
  const numPart = args.problemNumber != null ? `${args.problemNumber}번` : "";
  return `${args.shortLabel} ${yearPart}${round} ${numPart}${originSuffix}`.trim();
}

export function articleHref(lawCode: string, articleNumber: string | null) {
  return articleNumber ? `/subjects/${lawCode}/articles/${articleNumber}` : null;
}
export function caseHref(lawCode: string | null, caseId: string) {
  return lawCode ? `/subjects/${lawCode}/cases/${caseId}` : null;
}
export function problemHref(lawCode: string | null, problemId: string) {
  return lawCode ? `/subjects/${lawCode}/problems/${problemId}` : null;
}

export async function resolveTargetDisplay(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<TargetDisplay | null> {
  if (targetType === "article") {
    const { data, error } = await client
      .from("articles")
      .select("article_number, display_label, laws ( law_code, short_label )")
      .eq("article_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data || !data.laws) return null;
    return {
      label: `${data.laws.short_label} ${data.display_label}`,
      href: articleHref(data.laws.law_code, data.article_number),
    };
  }

  if (targetType === "case") {
    const { data, error } = await client
      .from("cases")
      .select("case_id, case_number, subject_laws")
      .eq("case_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    const lawCode = data.subject_laws?.[0] ?? null;
    return {
      label: data.case_number,
      href: caseHref(lawCode, data.case_id),
    };
  }

  if (targetType === "problem") {
    const { data, error } = await client
      .from("problems")
      .select(
        "problem_id, year, exam_round, problem_number, origin, laws ( law_code, short_label )",
      )
      .eq("problem_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    const shortLabel = data.laws?.short_label ?? "문제";
    return {
      label: problemDisplayLabel({
        shortLabel,
        year: data.year,
        examRound: data.exam_round,
        problemNumber: data.problem_number,
        origin: data.origin,
      }),
      href: problemHref(data.laws?.law_code ?? null, data.problem_id),
    };
  }

  if (targetType === "study_method") {
    return { label: "공부방법", href: null };
  }
  return null;
}

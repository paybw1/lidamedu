// Q&A 대상(article/case/problem) 단위로 표시용 라벨 + 진입 URL 을 만들어주는 헬퍼.
// 실패해도 Q&A 동작은 영향 없도록 null 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { QnaTargetType } from "../labels";

export interface TargetDisplay {
  label: string;
  href: string | null;
}

type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];

// ── 순수 라벨/링크 빌더 (target-resolve 와 공유 — SSOT) ──
// 객관식은 모두 1차라 차수는 표기하지 않는다. 기출/변형=년도+번호, 예상/모의=출처+번호(년도 없음).
export function problemDisplayLabel(args: {
  shortLabel: string;
  year: number | null;
  problemNumber: number | null;
  origin: ProblemOrigin;
}): string {
  const num = args.problemNumber != null ? `${args.problemNumber}번` : "";
  if (args.origin === "expected") return `${args.shortLabel} 예상 ${num}`.trim();
  if (args.origin === "mock") return `${args.shortLabel} 모의 ${num}`.trim();
  const yearPart = args.year ? `${args.year}년 ` : "";
  const suffix =
    args.origin === "past_exam_variant"
      ? " (변형)"
      : args.origin === "ai_draft"
        ? " (초안)"
        : "";
  return `${args.shortLabel} ${yearPart}${num}${suffix}`.trim();
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
export function nodeHref(lawCode: string | null, nodeId: string) {
  return lawCode ? `/subjects/${lawCode}/systematic/${nodeId}` : null;
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
        "problem_id, year, problem_number, origin, laws ( law_code, short_label )",
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
        problemNumber: data.problem_number,
        origin: data.origin,
      }),
      href: problemHref(data.laws?.law_code ?? null, data.problem_id),
    };
  }

  if (targetType === "node") {
    const { data, error } = await client
      .from("systematic_nodes")
      .select("node_id, display_label, law_code")
      .eq("node_id", targetId)
      .maybeSingle();
    if (error || !data) return null;
    const { data: law } = await client
      .from("laws")
      .select("short_label")
      .eq("law_code", data.law_code)
      .maybeSingle();
    const prefix = law?.short_label ? `${law.short_label} ` : "";
    return {
      label: `${prefix}${data.display_label}`,
      href: nodeHref(data.law_code, data.node_id),
    };
  }

  if (targetType === "study_method") {
    return { label: "공부방법", href: null };
  }
  return null;
}

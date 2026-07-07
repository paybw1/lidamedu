// Q&A 대상(article/case/problem) 단위로 표시용 라벨 + 진입 URL 을 만들어주는 헬퍼.
// 실패해도 Q&A 동작은 영향 없도록 null 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { formatProblemCode } from "~/features/problems/lib/problem-code";
import { LAW_SUBJECTS, type LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { QnaTargetType } from "../labels";

// 대상 breadcrumb 한 세그먼트 — 과목 › 유형 › 식별자 › 쟁점(체계도 노드).
//   subject/type = 색 pill, ident = 굵은 텍스트(+부제 sub), node = 쟁점(링크 톤).
export interface CrumbSegment {
  kind: "subject" | "type" | "ident" | "node";
  text: string;
  sub?: string;
}

export interface TargetDisplay {
  label: string;
  href: string | null;
  // ★ 리스트/상세에서 "무엇에 대한 질문인지" 4단계 경로로 표시(있을 때만).
  segments?: CrumbSegment[];
}

type ProblemOrigin = Database["public"]["Enums"]["problem_origin"];
type CaseCourt = Database["public"]["Enums"]["case_court"];

const COURT_LABEL: Record<CaseCourt, string> = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};

// 문제 출처 라벨 — 객관식은 모두 1차라 차수 미표기. 기출/변형은 년도와 함께.
const ORIGIN_LABEL: Record<ProblemOrigin, string> = {
  past_exam: "기출",
  past_exam_variant: "기출(변형)",
  expected: "예상",
  mock: "모의",
  ai_draft: "초안",
};

// 과목 짧은 이름(특허법 → 특허). law_code 는 과목 slug 와 동일.
function subjectShort(lawCode: string | null, fallback: string): string {
  const meta = lawCode
    ? LAW_SUBJECTS[lawCode as LawSubjectSlug]
    : undefined;
  return meta?.shortName ?? fallback;
}

// "2003-03-14" → "2003. 3. 14." (선고일 표기, 앞자리 0 제거).
function formatDecided(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.`;
}

// 체계도 노드 라벨 조회 — primary_node_id(판례·문제) 단건.
async function nodeLabelById(
  client: SupabaseClient<Database>,
  nodeId: string | null,
): Promise<string | null> {
  if (!nodeId) return null;
  const { data } = await client
    .from("systematic_nodes")
    .select("display_label")
    .eq("node_id", nodeId)
    .maybeSingle();
  return data?.display_label ?? null;
}

// 조문이 걸린 체계도 노드(여럿 가능) 중 path 우선 1개만 — 중복 표시 방지.
async function articleNodeLabel(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<string | null> {
  const { data } = await client
    .from("article_systematic_links")
    .select("systematic_nodes ( display_label, path )")
    .eq("article_id", articleId);
  const rows = (data ?? [])
    .map((r) => r.systematic_nodes)
    .filter(
      (n): n is { display_label: string; path: unknown } => n != null,
    )
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return rows[0]?.display_label ?? null;
}

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
  // 스레드의 단원 앵커(qna_threads.node_id) — 있으면 조문의 대표 링크 대신 이 노드를
  // 쟁점 세그먼트로 쓴다(29조처럼 여러 쟁점에 걸친 조문의 오표기 방지).
  threadNodeId?: string | null,
): Promise<TargetDisplay | null> {
  if (targetType === "article") {
    const { data, error } = await client
      .from("articles")
      .select(
        "article_id, article_number, display_label, laws ( law_code, short_label )",
      )
      .eq("article_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data || !data.laws) return null;
    const node = threadNodeId
      ? await nodeLabelById(client, threadNodeId)
      : await articleNodeLabel(client, data.article_id);
    // display_label = "제29조 특허요건" — 첫 토큰(조문번호) / 나머지(조문제목)로 분리.
    const [numPart, ...rest] = data.display_label.split(" ");
    const title = rest.join(" ").trim();
    const segments: CrumbSegment[] = [
      { kind: "subject", text: subjectShort(data.laws.law_code, data.laws.short_label) },
      { kind: "type", text: "조문" },
      { kind: "ident", text: numPart, sub: title || undefined },
    ];
    if (node) segments.push({ kind: "node", text: node });
    return {
      label: `${data.laws.short_label} ${data.display_label}`,
      href: articleHref(data.laws.law_code, data.article_number),
      segments,
    };
  }

  if (targetType === "case") {
    const { data, error } = await client
      .from("cases")
      .select(
        "case_id, case_number, court, decided_at, subject_laws, primary_node_id",
      )
      .eq("case_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    const lawCode = data.subject_laws?.[0] ?? null;
    const node = await nodeLabelById(client, data.primary_node_id);
    const cite = `${COURT_LABEL[data.court]} ${formatDecided(data.decided_at)} 선고`;
    const segments: CrumbSegment[] = [
      { kind: "subject", text: subjectShort(lawCode, "판례") },
      { kind: "type", text: "판례" },
      { kind: "ident", text: data.case_number, sub: cite },
    ];
    if (node) segments.push({ kind: "node", text: node });
    return {
      label: data.case_number,
      href: caseHref(lawCode, data.case_id),
      segments,
    };
  }

  if (targetType === "problem") {
    const { data, error } = await client
      .from("problems")
      .select(
        "problem_id, display_no, year, problem_number, origin, primary_node_id, laws ( law_code, short_label )",
      )
      .eq("problem_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    const shortLabel = data.laws?.short_label ?? "문제";
    const node = await nodeLabelById(client, data.primary_node_id);
    // 식별자 = (기출/변형)년도+출처 · 나머지=번호 + 고유번호(P-code).
    const isPast =
      data.origin === "past_exam" || data.origin === "past_exam_variant";
    const identText =
      isPast && data.year
        ? `${data.year}년 ${ORIGIN_LABEL[data.origin]}`
        : ORIGIN_LABEL[data.origin];
    const num = data.problem_number != null ? `${data.problem_number}번` : "";
    const sub = [num, formatProblemCode(data.display_no)]
      .filter(Boolean)
      .join(" · ");
    const segments: CrumbSegment[] = [
      { kind: "subject", text: subjectShort(data.laws?.law_code ?? null, "문제") },
      { kind: "type", text: "문제" },
      { kind: "ident", text: identText, sub: sub || undefined },
    ];
    if (node) segments.push({ kind: "node", text: node });
    return {
      label: problemDisplayLabel({
        shortLabel,
        year: data.year,
        problemNumber: data.problem_number,
        origin: data.origin,
      }),
      href: problemHref(data.laws?.law_code ?? null, data.problem_id),
      segments,
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
      segments: [
        { kind: "subject", text: subjectShort(data.law_code, law?.short_label ?? "쟁점") },
        { kind: "type", text: "쟁점" },
        { kind: "node", text: data.display_label },
      ],
    };
  }

  if (targetType === "study_method") {
    return { label: "공부방법", href: null };
  }
  return null;
}

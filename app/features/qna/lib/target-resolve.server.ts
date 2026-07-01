// 사람이 읽는 식별자(조문번호 / 쟁점노드 / 판례번호 / 과목·년도·번호 또는 체계도·번호)
// → Q&A target_id 해석. 커뮤니티 Q&A 대상 선택기에서 사용. 상세패널 질문과 동일한
// target_type+target_id 를 만들어주는 게 목적 — 해석 실패 시 null.

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
  nodeHref,
  problemDisplayLabel,
  problemHref,
  type TargetDisplay,
} from "./target-display.server";

export interface NodeOption {
  nodeId: string;
  label: string;
}
export interface ResolvedTarget extends TargetDisplay {
  targetType: QnaTargetType;
  targetId: string;
  // 조문이 여러 쟁점(노드)에 걸릴 때 — 쟁점 선택지(≥2면 UI 노출).
  nodes?: NodeOption[];
}

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
  return input.replace(/제/g, "").replace(/조/g, "").replace(/\s/g, "").trim();
}

// 한 조문이 걸린 체계도 노드 목록(쟁점 선택지).
async function getArticleNodes(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<NodeOption[]> {
  const { data: links } = await client
    .from("article_systematic_links")
    .select("node_id")
    .eq("article_id", articleId);
  const nodeIds = [...new Set((links ?? []).map((l) => l.node_id))];
  if (nodeIds.length === 0) return [];
  const { data: nodes } = await client
    .from("systematic_nodes")
    .select("node_id, display_label, path")
    .in("node_id", nodeIds);
  return (nodes ?? [])
    .sort((a, b) => String(a.path).localeCompare(String(b.path)))
    .map((n) => ({ nodeId: n.node_id, label: n.display_label }));
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
  const nodes = await getArticleNodes(client, article.articleId);
  return {
    targetType: "article",
    targetId: article.articleId,
    label: `${law.shortLabel} ${article.displayLabel}`,
    href: articleHref(lawCode, article.articleNumber),
    nodes,
  };
}

// 쟁점(체계도 노드) 대상 — 노드 id 검증 + 표시.
export async function resolveNodeTarget(
  client: SupabaseClient<Database>,
  nodeId: string,
): Promise<ResolvedTarget | null> {
  const { data: node } = await client
    .from("systematic_nodes")
    .select("node_id, display_label, law_code")
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!node) return null;
  const law = await getLawByCode(client, node.law_code as LawSubjectSlug);
  const prefix = law?.shortLabel ? `${law.shortLabel} ` : "";
  return {
    targetType: "node",
    targetId: node.node_id,
    label: `${prefix}${node.display_label}`,
    href: nodeHref(node.law_code, node.node_id),
  };
}

// 과목의 체계도 노드 목록(예상문제 대상 선택용). path 순.
export async function listSubjectNodes(
  client: SupabaseClient<Database>,
  subject: string,
): Promise<Array<{ nodeId: string; label: string; depth: number }>> {
  const lawCode = asLawSubject(subject);
  if (!lawCode) return [];
  const { data } = await client
    .from("systematic_nodes")
    .select("node_id, display_label, path")
    .eq("law_code", lawCode);
  return (data ?? [])
    .sort((a, b) => String(a.path).localeCompare(String(b.path)))
    .map((n) => ({
      nodeId: n.node_id,
      label: n.display_label,
      depth: Math.max(0, String(n.path).split(".").length - 2),
    }));
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

// 문제 대상 — 객관식은 모두 1차. 기출/변형=년도+번호, 예상=체계도(노드)+번호(year 없음).
export async function resolveProblemTarget(
  client: SupabaseClient<Database>,
  args: {
    subject: string;
    origin: Database["public"]["Enums"]["problem_origin"];
    problemNumber: number;
    year?: number;
    primaryNodeId?: string;
  },
): Promise<ResolvedTarget | null> {
  const lawCode = asLawSubject(args.subject);
  if (!lawCode) return null;
  const law = await getLawByCode(client, lawCode);
  if (!law) return null;

  let query = client
    .from("problems")
    .select("problem_id, year, problem_number, origin")
    .eq("law_id", law.lawId)
    .eq("origin", args.origin)
    .eq("problem_number", args.problemNumber)
    .is("deleted_at", null);

  if (args.origin === "expected") {
    if (!args.primaryNodeId) return null;
    query = query.eq("primary_node_id", args.primaryNodeId);
  } else {
    if (args.year == null) return null;
    query = query.eq("year", args.year).eq("exam_round", "first");
  }

  const { data, error } = await query.limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    targetType: "problem",
    targetId: row.problem_id,
    label: problemDisplayLabel({
      shortLabel: law.shortLabel,
      year: row.year,
      problemNumber: row.problem_number,
      origin: row.origin,
    }),
    href: problemHref(lawCode, row.problem_id),
  };
}

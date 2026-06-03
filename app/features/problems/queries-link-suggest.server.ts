// 예상문제 연결 도구 — 미연결 잔여 문제 목록 쿼리 + 적용 헬퍼.
// 후보 생성 자체는 lib/link-suggest.server.ts 의 suggestLinksForProblem 사용.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { ProblemOrigin } from "~/features/problems/labels";

export interface MissingLinkItem {
  problemId: string;
  origin: ProblemOrigin;
  lawCode: string | null;
  bodyPreview: string;
  /** primary_article_id 가 비어 있는가. */
  missingPrimary: boolean;
  choicesMissing: number;
  boxMissing: number;
  /** 합계. 정렬 기준 — 클수록 작업량 큼. */
  totalMissing: number;
}

interface ListOpts {
  origins: ProblemOrigin[];
  /** 단건 lawCode (legacy) — lawCodes 가 있으면 무시. */
  lawCode?: string | null;
  /** 과목 멀티 필터 — 비었으면 전체. */
  lawCodes?: string[];
  limit?: number;
}

/**
 * 선지/박스 중 explanation 있는데 related_article_id 가 비어 있는 — 또는
 * 문제 자체 primary_article_id 가 비어 있는 — 연결 잔여 후보 목록.
 *
 * RPC 없이 application 단에서 집계 (문제 수 < 1k 라 OK).
 */
export async function listProblemsWithMissingLinks(
  client: SupabaseClient<Database>,
  opts: ListOpts,
): Promise<MissingLinkItem[]> {
  const limit = opts.limit ?? 200;

  let q = client
    .from("problems")
    .select(`
      problem_id, origin, primary_article_id, body_md, deleted_at,
      laws:law_id(law_code)
    `)
    .is("deleted_at", null)
    .in("origin", opts.origins)
    .order("created_at", { ascending: false })
    .limit(limit);
  const codes = opts.lawCodes && opts.lawCodes.length > 0
    ? opts.lawCodes
    : opts.lawCode
      ? [opts.lawCode]
      : [];
  if (codes.length > 0) {
    const { data: lawRows } = await client.from("laws").select("law_id, law_code").in("law_code", codes);
    const ids = (lawRows ?? []).map((r) => r.law_id);
    if (ids.length > 0) q = q.in("law_id", ids);
    else q = q.eq("law_id", "00000000-0000-0000-0000-000000000000"); // 매칭 0건 강제
  }
  const { data: probs, error } = await q;
  if (error || !probs) return [];
  if (probs.length === 0) return [];

  const problemIds = probs.map((p) => p.problem_id);

  // 선지 미연결 카운트.
  const { data: choices } = await client
    .from("problem_choices")
    .select("problem_id, related_article_id, explanation_md")
    .in("problem_id", problemIds);
  const choiceMissing = new Map<string, number>();
  for (const c of choices ?? []) {
    if (!c.related_article_id && c.explanation_md && c.explanation_md.trim() !== "") {
      choiceMissing.set(c.problem_id, (choiceMissing.get(c.problem_id) ?? 0) + 1);
    }
  }

  // 박스 미연결 카운트.
  const { data: boxes } = await client
    .from("problem_box_items")
    .select("problem_id, related_article_id, explanation_md")
    .in("problem_id", problemIds);
  const boxMissing = new Map<string, number>();
  for (const b of boxes ?? []) {
    if (!b.related_article_id && b.explanation_md && b.explanation_md.trim() !== "") {
      boxMissing.set(b.problem_id, (boxMissing.get(b.problem_id) ?? 0) + 1);
    }
  }

  const items: MissingLinkItem[] = probs.map((p) => {
    const cm = choiceMissing.get(p.problem_id) ?? 0;
    const bm = boxMissing.get(p.problem_id) ?? 0;
    const noPrimary = !p.primary_article_id;
    return {
      problemId: p.problem_id,
      origin: p.origin,
      lawCode: (p.laws as { law_code: string } | null)?.law_code ?? null,
      bodyPreview: (p.body_md ?? "").slice(0, 100),
      missingPrimary: noPrimary,
      choicesMissing: cm,
      boxMissing: bm,
      totalMissing: cm + bm + (noPrimary ? 1 : 0),
    };
  });
  // 미연결 잔여 > 0 만, 잔여 큰 순.
  return items
    .filter((it) => it.totalMissing > 0)
    .sort((a, b) => b.totalMissing - a.totalMissing);
}

// ── 승인 적용 ────────────────────────────────────────────────────────────

export type ApplyTarget =
  | { kind: "choice"; choiceId: string; articleId: string | null; caseId: string | null }
  | { kind: "box"; boxItemId: string; articleId: string | null; caseId: string | null }
  | { kind: "primary"; problemId: string; articleId: string }
  | { kind: "problem-case"; problemId: string; caseId: string };

export interface ApplyResult {
  applied: number;
  errors: string[];
}

export async function applyLinkApprovals(
  client: SupabaseClient<Database>,
  userId: string,
  targets: ApplyTarget[],
): Promise<ApplyResult> {
  let applied = 0;
  const errors: string[] = [];
  for (const t of targets) {
    if (t.kind === "choice") {
      const update: Record<string, unknown> = {};
      if (t.articleId !== null) update.related_article_id = t.articleId;
      if (t.caseId !== null) update.related_case_id = t.caseId;
      if (Object.keys(update).length === 0) continue;
      const { error } = await client
        .from("problem_choices")
        .update(update)
        .eq("choice_id", t.choiceId);
      if (error) errors.push(`choice ${t.choiceId}: ${error.message}`);
      else applied += 1;
    } else if (t.kind === "box") {
      const update: Record<string, unknown> = {};
      if (t.articleId !== null) update.related_article_id = t.articleId;
      if (t.caseId !== null) update.related_case_id = t.caseId;
      if (Object.keys(update).length === 0) continue;
      const { error } = await client
        .from("problem_box_items")
        .update(update)
        .eq("box_item_id", t.boxItemId);
      if (error) errors.push(`box ${t.boxItemId}: ${error.message}`);
      else applied += 1;
    } else if (t.kind === "primary") {
      const { error } = await client
        .from("problems")
        .update({ primary_article_id: t.articleId })
        .eq("problem_id", t.problemId);
      if (error) errors.push(`primary ${t.problemId}: ${error.message}`);
      else applied += 1;
    } else if (t.kind === "problem-case") {
      // problem_case_links — 기존 동일 (problem_id, case_id) 있으면 skip (멱등).
      const { data: existing } = await client
        .from("problem_case_links")
        .select("link_id")
        .eq("problem_id", t.problemId)
        .eq("case_id", t.caseId)
        .limit(1);
      if (existing && existing.length > 0) {
        applied += 1;
        continue;
      }
      const { error } = await client
        .from("problem_case_links")
        .insert({
          problem_id: t.problemId,
          case_id: t.caseId,
          relation_type: "cited",
          note: "link-suggest-approved",
          created_by: userId,
        });
      if (error) errors.push(`problem-case ${t.problemId}/${t.caseId}: ${error.message}`);
      else applied += 1;
    }
  }
  return { applied, errors };
}

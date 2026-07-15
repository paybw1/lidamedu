// 선순환 P4 — 문제→체계도 노드 귀속 규칙 SSOT.
//   primary_node_id(핀) 우선, 없으면 primary_article_id → article_systematic_links 파생.
//   개인 약점(getWeakNodes)·코호트 약점(buildProblemNodeAttribution)·마스터리(getNodeMastery)·
//   OX 진단(computeOxDiagnosis)이 이 규칙을 공유해 재분기(edge divergence)를 방지한다.
//   ※ 폴백 다중성만 소비처별로 다름(약점=모든 노드, 마스터리·OX=첫째) → 옵션으로 흡수.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export interface ProblemNodeInput {
  primary_node_id: string | null;
  primary_article_id: string | null;
}

/**
 * 문제 하나를 체계도 노드로 귀속.
 *   - 핀(primary_node_id) 있으면 그 노드 단독.
 *   - 없으면 primary_article_id 로 걸린 조문 링크 노드 파생.
 * fallbackMultiplicity:
 *   'all'   = 조문이 걸린 모든 노드 (개인/코호트 약점 — 조문 1개가 여러 논점 노드에 걸린 경우 분산 집계)
 *   'first' = 첫 노드만 (마스터리·OX 진단 — 단일 노드 귀속, 기존 동작 보존)
 */
export function attributeProblemNodes(
  problem: ProblemNodeInput,
  articleToNodes: Map<string, string[]>,
  opts?: { fallbackMultiplicity?: "all" | "first" },
): string[] {
  if (problem.primary_node_id) return [problem.primary_node_id];
  const aid = problem.primary_article_id;
  if (!aid) return [];
  const nodes = articleToNodes.get(aid) ?? [];
  return opts?.fallbackMultiplicity === "first" ? nodes.slice(0, 1) : nodes;
}

/**
 * article_id → 걸린 node_id[] 맵(행 순서 보존; 'first' 폴백은 [0]).
 *   .order() 없이 조회하던 기존 소비처(마스터리·OX)와 동일한 삽입 순서 의미.
 */
export async function buildArticleToNodes(
  client: SupabaseClient<Database>,
  articleIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const uniq = [...new Set(articleIds.filter((v): v is string => !!v))];
  const CHUNK = 300; // .in() URL 길이 안전 청크
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    const { data } = await client
      .from("article_systematic_links")
      .select("article_id, node_id")
      .in("article_id", slice);
    for (const l of data ?? []) {
      const arr = map.get(l.article_id) ?? [];
      arr.push(l.node_id);
      map.set(l.article_id, arr);
    }
  }
  return map;
}

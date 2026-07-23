// feat-2-030 — 빈칸 난이도 단계 통과 기록 조회/저장(서버).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  BLANK_TIERS,
  type BlankTier,
  type ChapterTierGate,
} from "~/features/blanks/lib/tiers";
import type { ArticleNode } from "~/features/laws/queries.server";

import { getBlankSetsByArticleIds } from "./queries.server";

// 세트별 완료 tier 목록.
export async function getTierCompletionsBySet(
  client: SupabaseClient<Database>,
  userId: string,
  setIds: string[],
): Promise<Record<string, BlankTier[]>> {
  const out: Record<string, BlankTier[]> = {};
  if (setIds.length === 0) return out;
  const { data } = await client
    .from("blank_tier_completions")
    .select("set_id, tier")
    .eq("user_id", userId)
    .in("set_id", setIds);
  for (const r of data ?? []) {
    const t = r.tier as BlankTier;
    if (!BLANK_TIERS.includes(t)) continue;
    (out[r.set_id] ??= []).push(t);
  }
  return out;
}

// feat-2-030 S4-B — 장/편 단위 게이트. 현재 조문이 속한 장(특허 등=chapter, 민법=part)의
//   **빈칸 세트가 있는 모든 조문**을 모수로, 그 전체가 하(중)를 통과해야 중(상)이 열린다.
//   세트 없는 조문은 모수에서 제외(안 그러면 영영 안 열림). 게이트 노드 없거나 세트 0이면 null →
//   호출부가 세트 단위(tierUnlockState)로 폴백.
export async function getChapterTierGate(
  client: SupabaseClient<Database>,
  userId: string,
  articles: ArticleNode[],
  currentArticleId: string,
  gateLevel: "chapter" | "part",
): Promise<ChapterTierGate | null> {
  const byId = new Map(articles.map((a) => [a.articleId, a]));
  // 현재 조문 → 상위 gateLevel 노드까지 parentId walk.
  let node: ArticleNode | null | undefined = byId.get(currentArticleId);
  let gate: ArticleNode | null = null;
  const guard = new Set<string>();
  while (node && !guard.has(node.articleId)) {
    guard.add(node.articleId);
    if (node.level === gateLevel) {
      gate = node;
      break;
    }
    node = node.parentId ? byId.get(node.parentId) : null;
  }
  if (!gate) return null;
  // 그 장의 모든 조문(path prefix).
  const prefix = `${gate.path}.`;
  const articleIds = articles
    .filter(
      (a) =>
        a.level === "article" &&
        (a.path === gate!.path || a.path.startsWith(prefix)),
    )
    .map((a) => a.articleId);
  if (articleIds.length === 0) return null;
  // ★.in() URL 초과 방어(민법 편은 조문 수백 개) — 150개씩 배치 조회 후 병합.
  const setIds: string[] = [];
  for (let i = 0; i < articleIds.length; i += 150) {
    const chunk = articleIds.slice(i, i + 150);
    const setsByArticle = await getBlankSetsByArticleIds(client, chunk);
    for (const s of Object.values(setsByArticle)) setIds.push(s.setId);
  }
  if (setIds.length === 0) return null;
  const comps = await getTierCompletionsBySet(client, userId, setIds);
  let tier1Sets = 0;
  let tier2Sets = 0;
  for (const sid of setIds) {
    const tiers = comps[sid] ?? [];
    if (tiers.includes(1)) tier1Sets++;
    if (tiers.includes(2)) tier2Sets++;
  }
  const totalSets = setIds.length;
  return {
    unlocked: {
      1: true,
      2: tier1Sets === totalSets,
      3: tier2Sets === totalSets,
    },
    totalSets,
    tier1Sets,
    tier2Sets,
    chapterLabel: gate.displayLabel,
  };
}

// 통과 tier(들) 멱등 기록. RLS self-insert(정답 재검증은 호출부 API 책임).
export async function recordTierCompletions(
  client: SupabaseClient<Database>,
  userId: string,
  setId: string,
  tiers: BlankTier[],
): Promise<void> {
  if (tiers.length === 0) return;
  await client.from("blank_tier_completions").upsert(
    tiers.map((tier) => ({ user_id: userId, set_id: setId, tier })),
    { onConflict: "user_id,set_id,tier", ignoreDuplicates: true },
  );
}

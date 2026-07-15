// 약점 체계도 노드 추출 — 모든 법률 과목을 훑어 가장 정답률 낮은 노드 top N.
// 대시보드 위젯·개인 약점 보충 과제(weak-personal)에서 사용.
//
// 선순환 P4 — 문제→노드 귀속을 코호트/마스터리/OX 와 동일 규칙으로 정렬:
//   primary_node_id(핀) 우선 / 없으면 primary_article_id→article_systematic_links(모든 노드).
//   이전엔 조문 경로 전용이라 핀 재배치(특허)를 반영 못 했음. 규칙 SSOT = problem-node-attribution.
// 집계 의미는 기존과 동일(전 시도 합산, 노드 직속 통계, 시도 표본 ≥ 5).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { getSystematicSkeleton } from "~/features/laws/queries.server";

import { attributeProblemNodes } from "./problem-node-attribution.server";
import type { LawSubjectSlug } from "./subjects";

export interface WeakNodeItem {
  lawCode: LawSubjectSlug;
  nodeId: string;
  displayLabel: string;
  articleCount: number;
  problemAttempts: number;
  problemCorrect: number;
  accuracyPct: number; // 0~100
  weaknessScore: number; // 정렬키 — 정답률 낮을수록 + 시도 많을수록 ↑
}

const MIN_ATTEMPTS_FOR_RANKING = 5; // 시도 표본 부족 노드는 제외.
const CHUNK = 300; // .in() URL 길이 안전 청크.

interface NodeMeta {
  lawCode: LawSubjectSlug;
  displayLabel: string;
  articleCount: number;
}

/** 사용자의 전체 문제 시도를 problem_id별 (총 시도수, 정답수)로 집계 (range 페이징). */
async function fetchUserAttemptTotals(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Map<string, { attempts: number; correct: number }>> {
  const out = new Map<string, { attempts: number; correct: number }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await client
      .from("user_problem_attempts")
      .select("problem_id, is_correct")
      .eq("user_id", userId)
      .range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      const s = out.get(r.problem_id) ?? { attempts: 0, correct: 0 };
      s.attempts += 1;
      if (r.is_correct) s.correct += 1;
      out.set(r.problem_id, s);
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function getWeakNodes(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: LawSubjectSlug[],
  limit = 5,
): Promise<WeakNodeItem[]> {
  // 1. 과목별 skeleton → 노드 메타 + article→node[](조문 폴백용).
  const nodeMeta = new Map<string, NodeMeta>();
  const articleToNodes = new Map<string, string[]>();
  for (const lawCode of lawCodes) {
    const skeleton = await getSystematicSkeleton(client, lawCode);
    for (const n of skeleton) {
      nodeMeta.set(n.nodeId, {
        lawCode,
        displayLabel: n.displayLabel,
        articleCount: n.articles.length,
      });
      for (const a of n.articles) {
        const arr = articleToNodes.get(a.articleId) ?? [];
        arr.push(n.nodeId);
        articleToNodes.set(a.articleId, arr);
      }
    }
  }
  if (nodeMeta.size === 0) return [];

  // 2. 본인 시도 집계(전 시도 합 — 기존 의미 보존).
  const attemptsByProblem = await fetchUserAttemptTotals(client, userId);
  const attemptedIds = [...attemptsByProblem.keys()];
  if (attemptedIds.length === 0) return [];

  // 3. 시도 문제의 (핀·조문) 조회 → 노드 귀속(핀 우선 / 조문 폴백 all). 삭제 문제 제외.
  const attribInput = new Map<
    string,
    { primary_node_id: string | null; primary_article_id: string | null }
  >();
  for (let i = 0; i < attemptedIds.length; i += CHUNK) {
    const slice = attemptedIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("problems")
      .select("problem_id, primary_node_id, primary_article_id")
      .in("problem_id", slice)
      .is("deleted_at", null);
    for (const p of data ?? [])
      attribInput.set(p.problem_id, {
        primary_node_id: p.primary_node_id,
        primary_article_id: p.primary_article_id,
      });
  }

  // 4. 노드별 시도/정답 합산(문제가 여러 노드에 걸리면 각 노드에 가산 = 기존 조문 분산과 동일).
  const agg = new Map<string, { attempts: number; correct: number }>();
  for (const [pid, stat] of attemptsByProblem) {
    const input = attribInput.get(pid);
    if (!input) continue; // 삭제됐거나 조회 실패한 문제.
    for (const nid of attributeProblemNodes(input, articleToNodes, {
      fallbackMultiplicity: "all",
    })) {
      if (!nodeMeta.has(nid)) continue; // 요청 과목 skeleton 밖 노드는 제외.
      const a = agg.get(nid) ?? { attempts: 0, correct: 0 };
      a.attempts += stat.attempts;
      a.correct += stat.correct;
      agg.set(nid, a);
    }
  }

  // 5. 약점 점수화(기존 공식 유지).
  const candidates: WeakNodeItem[] = [];
  for (const [nodeId, a] of agg) {
    if (a.attempts < MIN_ATTEMPTS_FOR_RANKING) continue;
    const meta = nodeMeta.get(nodeId);
    if (!meta) continue;
    const accuracyPct = Math.round((a.correct / a.attempts) * 100);
    // 약점 점수: (100 - 정답률) × log(시도+1) — 정답률 낮고 시도 많을수록 ↑.
    const weaknessScore = (100 - accuracyPct) * Math.log10(a.attempts + 1);
    candidates.push({
      lawCode: meta.lawCode,
      nodeId,
      displayLabel: meta.displayLabel,
      articleCount: meta.articleCount,
      problemAttempts: a.attempts,
      problemCorrect: a.correct,
      accuracyPct,
      weaknessScore,
    });
  }
  candidates.sort((a, b) => b.weaknessScore - a.weaknessScore);
  return candidates.slice(0, limit);
}

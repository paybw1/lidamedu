// feat-2-027 Phase 1-b — 단원 마스터리 서버 산출 (DB 조회 → 순수 computeNodeMastery 적용).
// 사용자 전체 문제 시도를 노드별로 집계(최신 1회=현재 숙련도) + user_problem_srs 파지(평균 reps·overdue)
// → 노드별 마스터리 단계. 문제→노드 매핑은 getSessionWeakNodes 와 동일(primary_node_id 우선, 없으면
// primary_article_id → article_systematic_links 첫째). 노드의 law_code 로 과목 필터.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import { type MasteryStage, computeNodeMastery } from "./lib/mastery";

export interface NodeMasteryRow {
  lawCode: string;
  nodeId: string;
  displayLabel: string;
  attempts: number; // 노드 내 시도한 distinct 문제 수(최신 기준)
  correct: number; // 그중 최신이 정답인 수
  accuracyPct: number; // 0~100
  avgReps: number; // 노드 SRS-추적 문제들의 평균 reps(파지 신호, 0=추적 없음)
  overdueCount: number; // 노드 내 next_due_at < now 인 SRS 항목 수
  stage: MasteryStage;
}

const CHUNK = 300; // .in() URL 길이 안전 청크

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 사용자의 문제 시도를 problem_id별 최신 정오로 dedup (range 페이징 — 유일키 attempt_id 타이브레이커). */
async function fetchLatestAttempts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Map<string, boolean>> {
  const latest = new Map<string, boolean>();
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await client
      .from("user_problem_attempts")
      .select("attempt_id, problem_id, is_correct, attempted_at")
      .eq("user_id", userId)
      .order("attempted_at", { ascending: false })
      .order("attempt_id", { ascending: false })
      .range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (seen.has(r.problem_id)) continue;
      seen.add(r.problem_id);
      latest.set(r.problem_id, r.is_correct);
    }
    if (data.length < 1000) break;
  }
  return latest;
}

export async function getNodeMastery(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: LawSubjectSlug[],
): Promise<NodeMasteryRow[]> {
  const allowLaw = new Set<string>(lawCodes);
  const latest = await fetchLatestAttempts(client, userId);
  const pids = [...latest.keys()];
  if (pids.length === 0) return [];

  // 1) 문제 → (primary_node_id, primary_article_id).
  const articleByProblem = new Map<string, string | null>();
  const pinnedNodeByProblem = new Map<string, string | null>();
  for (const part of chunk(pids, CHUNK)) {
    const { data } = await client
      .from("problems")
      .select("problem_id, primary_article_id, primary_node_id")
      .in("problem_id", part);
    for (const p of data ?? []) {
      articleByProblem.set(p.problem_id, p.primary_article_id);
      pinnedNodeByProblem.set(p.problem_id, p.primary_node_id);
    }
  }

  // 2) article → node (다중 매핑은 첫째만, getSessionWeakNodes 와 동일).
  const articleIds = [...articleByProblem.values()].filter(
    (v): v is string => !!v,
  );
  const nodeByArticle = new Map<string, string>();
  for (const part of chunk(articleIds, CHUNK)) {
    if (part.length === 0) continue;
    const { data } = await client
      .from("article_systematic_links")
      .select("article_id, node_id")
      .in("article_id", part);
    for (const l of data ?? []) {
      if (!nodeByArticle.has(l.article_id)) {
        nodeByArticle.set(l.article_id, l.node_id);
      }
    }
  }

  // 3) 문제별 최종 노드.
  const nodeByProblem = new Map<string, string | null>();
  for (const pid of pids) {
    const pinned = pinnedNodeByProblem.get(pid) ?? null;
    if (pinned) {
      nodeByProblem.set(pid, pinned);
      continue;
    }
    const articleId = articleByProblem.get(pid) ?? null;
    nodeByProblem.set(
      pid,
      articleId ? (nodeByArticle.get(articleId) ?? null) : null,
    );
  }

  // 4) 노드 라벨 + law_code (과목 필터).
  const nodeIds = [
    ...new Set([...nodeByProblem.values()].filter((v): v is string => !!v)),
  ];
  const nodeMeta = new Map<string, { label: string; lawCode: string }>();
  for (const part of chunk(nodeIds, CHUNK)) {
    if (part.length === 0) continue;
    const { data } = await client
      .from("systematic_nodes")
      .select("node_id, display_label, law_code")
      .in("node_id", part);
    for (const n of data ?? []) {
      nodeMeta.set(n.node_id, { label: n.display_label, lawCode: n.law_code });
    }
  }

  // 5) SRS 파지: 시도 문제들의 reps·next_due_at.
  const nowMs = Date.now();
  const repsByProblem = new Map<string, number>();
  const overdueByProblem = new Map<string, boolean>();
  for (const part of chunk(pids, CHUNK)) {
    const { data } = await client
      .from("user_problem_srs")
      .select("problem_id, reps, next_due_at")
      .eq("user_id", userId)
      .in("problem_id", part);
    for (const s of data ?? []) {
      repsByProblem.set(s.problem_id, s.reps ?? 0);
      if (s.next_due_at && new Date(s.next_due_at).getTime() < nowMs) {
        overdueByProblem.set(s.problem_id, true);
      }
    }
  }

  // 6) 노드별 집계 → 마스터리 단계.
  interface Agg {
    attempts: number;
    correct: number;
    repsSum: number;
    repsCount: number;
    overdueCount: number;
  }
  const byNode = new Map<string, Agg>();
  for (const pid of pids) {
    const nodeId = nodeByProblem.get(pid);
    if (!nodeId) continue; // 미매핑(기타)은 단원 마스터리에서 제외
    const meta = nodeMeta.get(nodeId);
    if (!meta || !allowLaw.has(meta.lawCode)) continue; // 과목 필터
    const agg = byNode.get(nodeId) ?? {
      attempts: 0,
      correct: 0,
      repsSum: 0,
      repsCount: 0,
      overdueCount: 0,
    };
    agg.attempts += 1;
    if (latest.get(pid)) agg.correct += 1;
    if (repsByProblem.has(pid)) {
      agg.repsSum += repsByProblem.get(pid) ?? 0;
      agg.repsCount += 1;
    }
    if (overdueByProblem.get(pid)) agg.overdueCount += 1;
    byNode.set(nodeId, agg);
  }

  const rows: NodeMasteryRow[] = [];
  for (const [nodeId, a] of byNode) {
    const meta = nodeMeta.get(nodeId);
    if (!meta) continue;
    const accuracyPct = a.attempts > 0 ? Math.round((a.correct / a.attempts) * 100) : 0;
    const avgReps = a.repsCount > 0 ? a.repsSum / a.repsCount : 0;
    const stage = computeNodeMastery({
      attempts: a.attempts,
      accuracyPct,
      srsReps: avgReps,
      overdueCount: a.overdueCount,
    });
    rows.push({
      lawCode: meta.lawCode,
      nodeId,
      displayLabel: meta.label,
      attempts: a.attempts,
      correct: a.correct,
      accuracyPct,
      avgReps: Math.round(avgReps * 10) / 10,
      overdueCount: a.overdueCount,
      stage,
    });
  }
  return rows;
}

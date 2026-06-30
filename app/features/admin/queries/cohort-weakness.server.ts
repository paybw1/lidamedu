// 반 공통 약점 노드 집계 (feat-10 고도화 단계4). adminClient 전제(profiles RLS 교차읽기 불가 →
// 호출부가 service_role + cohort.ownerId 게이트로 보호). 단원(systematic_node) 단위.
//
// 설계: docs/features/모의고사-문제집추가-고도화.md §1.2.
//   - 멤버 user_problem_attempts 를 (학생,문제) 최신 1건으로 dedup → 노드 귀속(primary_node_id
//     직접 + primary_article_id→article_systematic_links) → 노드별 풀링 정답률·약점점수.
//   - "공통" 가드: 그 노드를 시도한 서로 다른 학생 ≥ max(floor, ceil(minRatio×반인원)) + 누적시도 ≥ minAttempts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  getLawByCode,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { getSystematicNodeProblemSequence } from "~/features/problems/queries.server";
import { pickProblemsFromWeakNodes } from "~/features/problems/lib/problem-selection";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface CohortWeakNode {
  nodeId: string;
  displayLabel: string;
  /** (학생,문제) 쌍 수(최신 시도 기준). */
  attempts: number;
  correctAttempts: number;
  accuracyPct: number;
  /** 그 노드를 시도한 서로 다른 학생 수. */
  distinctStudents: number;
  weaknessScore: number;
}

export interface CohortWeaknessResult {
  cohortSize: number;
  /** 노드가 "공통 약점"으로 잡히는 데 필요한 시도 학생 수. */
  threshold: number;
  nodes: CohortWeakNode[];
}

export async function getCohortWeakNodes(
  client: SupabaseClient<Database>,
  cohortId: string,
  lawCode: LawSubjectSlug,
  opts?: {
    minRatio?: number;
    floorStudents?: number;
    minAttempts?: number;
    limit?: number;
  },
): Promise<CohortWeaknessResult> {
  const minRatio = opts?.minRatio ?? 0.3;
  const floorStudents = opts?.floorStudents ?? 3;
  const minAttempts = opts?.minAttempts ?? 5;
  const limit = opts?.limit ?? 12;

  // 1) 멤버
  const { data: members } = await client
    .from("cohort_members")
    .select("profile_id")
    .eq("cohort_id", cohortId);
  const userIds = [...new Set((members ?? []).map((m) => m.profile_id))];
  const cohortSize = userIds.length;
  const threshold = Math.max(floorStudents, Math.ceil(minRatio * cohortSize));
  if (cohortSize === 0) return { cohortSize: 0, threshold, nodes: [] };

  // 2) 멤버 (학생,문제) 최신 시도 1건 — 과목 무관 1회 스캔.
  const latest = await fetchLatestAttemptsForProfiles(client, userIds);
  if (latest.size === 0) return { cohortSize, threshold, nodes: [] };

  // 3) 과목 귀속 + 노드별 집계 + 공통 가드.
  const nodes = await weakNodesFromLatestAttempts(client, latest, lawCode, {
    threshold,
    minAttempts,
    limit,
  });
  return { cohortSize, threshold, nodes };
}

// (학생,문제) 최신 시도 1건 맵 — 과목 무관. getCohortWeakNodes·전체 약점(getAllStudentsWeakNodes)
// 공용 스캔 코어. attempted_at asc 페이지네이션(마지막 set = 최신). admin/RLS 우회는 caller 책임.
export type LatestAttempt = { userId: string; problemId: string; correct: boolean };

export async function fetchLatestAttemptsForProfiles(
  client: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, LatestAttempt>> {
  const latest = new Map<string, LatestAttempt>();
  if (userIds.length === 0) return latest;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("user_problem_attempts")
      .select("user_id, problem_id, is_correct, attempted_at")
      .in("user_id", userIds)
      .order("attempted_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      latest.set(`${r.user_id}|${r.problem_id}`, {
        userId: r.user_id,
        problemId: r.problem_id,
        correct: r.is_correct === true,
      });
    }
    if (rows.length < PAGE) break;
  }
  return latest;
}

// 시도된 문제들을 (이 과목의) 체계도 노드로 귀속. primary_node_id 직접 우선,
// 없으면 primary_article_id→article_systematic_links 파생. node 라벨 맵도 함께.
// 약점 집계·노드 역추적(getWeakNodeBreakdown) 공용.
export async function buildProblemNodeAttribution(
  client: SupabaseClient<Database>,
  attemptedIds: string[],
  lawCode: LawSubjectSlug,
): Promise<{
  problemNodes: Map<string, string[]>;
  nodeLabel: Map<string, string>;
}> {
  const problemNodes = new Map<string, string[]>();
  const nodeLabel = new Map<string, string>();

  const law = await getLawByCode(client, lawCode);
  if (!law) return { problemNodes, nodeLabel };
  const skeleton = await getSystematicSkeleton(client, lawCode);
  const articleToNodes = new Map<string, string[]>();
  for (const n of skeleton) {
    if (n.caseOnly) continue;
    nodeLabel.set(n.nodeId, n.displayLabel);
    for (const a of n.articles) {
      const arr = articleToNodes.get(a.articleId) ?? [];
      arr.push(n.nodeId);
      articleToNodes.set(a.articleId, arr);
    }
  }

  for (let i = 0; i < attemptedIds.length; i += 200) {
    const slice = attemptedIds.slice(i, i + 200);
    const { data } = await client
      .from("problems")
      .select("problem_id, primary_article_id, primary_node_id, law_id")
      .in("problem_id", slice)
      .eq("law_id", law.lawId)
      .is("deleted_at", null);
    for (const p of data ?? []) {
      const nodeIds = p.primary_node_id
        ? [p.primary_node_id]
        : p.primary_article_id
          ? (articleToNodes.get(p.primary_article_id) ?? [])
          : [];
      problemNodes.set(
        p.problem_id,
        nodeIds.filter((nid) => nodeLabel.has(nid)),
      );
    }
  }
  return { problemNodes, nodeLabel };
}

// latest 맵 + 과목 → 약점 노드. "공통" 가드 threshold(시도 학생 수)는 호출자가 모집단
// 정책(반 인원 비율 / 전체 학원 비율)에 맞춰 산정해 전달한다. 같은 latest 맵으로 5과목을
// 반복 호출하면 시도 스캔 1회로 전과목 약점을 얻는다(getAllStudentsWeakNodes).
export async function weakNodesFromLatestAttempts(
  client: SupabaseClient<Database>,
  latest: Map<string, LatestAttempt>,
  lawCode: LawSubjectSlug,
  opts: { threshold: number; minAttempts?: number; limit?: number },
): Promise<CohortWeakNode[]> {
  const minAttempts = opts.minAttempts ?? 5;
  const limit = opts.limit ?? 12;

  // 시도된 문제의 노드 귀속(이 과목만).
  const attemptedIds = [
    ...new Set([...latest.values()].map((v) => v.problemId)),
  ];
  const { problemNodes, nodeLabel } = await buildProblemNodeAttribution(
    client,
    attemptedIds,
    lawCode,
  );

  // 노드별 집계.
  const agg = new Map<
    string,
    { attempts: number; correct: number; students: Set<string> }
  >();
  for (const v of latest.values()) {
    const nodeIds = problemNodes.get(v.problemId);
    if (!nodeIds || nodeIds.length === 0) continue;
    for (const nid of nodeIds) {
      const a = agg.get(nid) ?? {
        attempts: 0,
        correct: 0,
        students: new Set<string>(),
      };
      a.attempts++;
      if (v.correct) a.correct++;
      a.students.add(v.userId);
      agg.set(nid, a);
    }
  }

  // 공통 가드 + 약점 점수 + 정렬.
  const nodes: CohortWeakNode[] = [];
  for (const [nid, a] of agg) {
    if (a.students.size < opts.threshold) continue;
    if (a.attempts < minAttempts) continue;
    const accuracyPct = Math.round((a.correct / a.attempts) * 100);
    nodes.push({
      nodeId: nid,
      displayLabel: nodeLabel.get(nid) ?? "(노드)",
      attempts: a.attempts,
      correctAttempts: a.correct,
      accuracyPct,
      distinctStudents: a.students.size,
      weaknessScore: (100 - accuracyPct) * Math.log10(a.attempts + 1),
    });
  }
  nodes.sort((x, y) => y.weaknessScore - x.weaknessScore);
  return nodes.slice(0, limit);
}

// ─── feat-7-040 후속: 약점 노드 → 문제 선택 seam (모의 picker·과제 출제 공용) ───
// cohort-weak-problems(모의)·assignment(약점→과제) 가 동일 규칙을 재사용한다.

export interface WeakNodeForSelection {
  nodeId: string;
  weaknessScore: number;
  displayLabel: string;
}

/**
 * 약점 노드들 → approved 문제 N개(가중 배분). 각 노드의 체계도 문제 시퀀스 →
 * approved 필터 → pickProblemsFromWeakNodes. adminClient 전제(호출부 owner 게이트 선행).
 */
export async function selectProblemsForWeakNodes(
  admin: SupabaseClient<Database>,
  weakNodes: readonly WeakNodeForSelection[],
  opts: { totalN: number; excludeIds?: ReadonlySet<string> },
): Promise<{ problemIds: string[]; nodeLabelByProblem: Map<string, string> }> {
  if (weakNodes.length === 0)
    return { problemIds: [], nodeLabelByProblem: new Map() };

  const seqs = await Promise.all(
    weakNodes.map((wn) => getSystematicNodeProblemSequence(admin, wn.nodeId)),
  );
  const rawByNode = new Map<string, string[]>();
  const allIds = new Set<string>();
  weakNodes.forEach((wn, i) => {
    const ids = (seqs[i]?.problems ?? []).map((p) => p.problemId);
    rawByNode.set(wn.nodeId, ids);
    for (const id of ids) allIds.add(id);
  });
  if (allIds.size === 0)
    return { problemIds: [], nodeLabelByProblem: new Map() };

  // approved 문제만(미승인/삭제 제외).
  const approved = new Set<string>();
  const idArr = [...allIds];
  for (let i = 0; i < idArr.length; i += 200) {
    const { data: rows } = await admin
      .from("problems")
      .select("problem_id")
      .in("problem_id", idArr.slice(i, i + 200))
      .eq("review_status", "approved")
      .is("deleted_at", null);
    for (const r of rows ?? []) approved.add(r.problem_id);
  }

  const problemsByNode = new Map<string, string[]>();
  for (const [nid, ids] of rawByNode)
    problemsByNode.set(
      nid,
      ids.filter((id) => approved.has(id)),
    );

  const problemIds = pickProblemsFromWeakNodes(
    weakNodes.map((wn) => ({
      nodeId: wn.nodeId,
      weaknessScore: wn.weaknessScore,
    })),
    problemsByNode,
    { totalN: opts.totalN, excludeIds: opts.excludeIds },
  );

  const nodeLabelByProblem = new Map<string, string>();
  for (const wn of weakNodes)
    for (const id of problemsByNode.get(wn.nodeId) ?? [])
      if (!nodeLabelByProblem.has(id))
        nodeLabelByProblem.set(id, wn.displayLabel);

  return { problemIds, nodeLabelByProblem };
}

export interface CohortWeakSelection {
  problemIds: string[];
  nodeLabelByProblem: Map<string, string>;
  cohortSize: number;
  threshold: number;
  weakNodeCount: number;
}

/** 반 공통 약점(getCohortWeakNodes) → approved 문제 N개. 모의·과제 공용. */
export async function selectCohortWeakProblems(
  admin: SupabaseClient<Database>,
  cohortId: string,
  lawCode: LawSubjectSlug,
  opts: { totalN: number; excludeIds?: ReadonlySet<string> },
): Promise<CohortWeakSelection> {
  const weak = await getCohortWeakNodes(admin, cohortId, lawCode);
  if (weak.nodes.length === 0) {
    return {
      problemIds: [],
      nodeLabelByProblem: new Map(),
      cohortSize: weak.cohortSize,
      threshold: weak.threshold,
      weakNodeCount: 0,
    };
  }
  const sel = await selectProblemsForWeakNodes(admin, weak.nodes, opts);
  return {
    ...sel,
    cohortSize: weak.cohortSize,
    threshold: weak.threshold,
    weakNodeCount: weak.nodes.length,
  };
}

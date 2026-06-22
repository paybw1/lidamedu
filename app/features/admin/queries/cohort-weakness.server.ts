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

  // 2) 과목 + 체계도 스켈레톤 → article→node(s), node 라벨
  const law = await getLawByCode(client, lawCode);
  if (!law) return { cohortSize, threshold, nodes: [] };
  const skeleton = await getSystematicSkeleton(client, lawCode);
  const articleToNodes = new Map<string, string[]>();
  const nodeLabel = new Map<string, string>();
  for (const n of skeleton) {
    if (n.caseOnly) continue;
    nodeLabel.set(n.nodeId, n.displayLabel);
    for (const a of n.articles) {
      const arr = articleToNodes.get(a.articleId) ?? [];
      arr.push(n.nodeId);
      articleToNodes.set(a.articleId, arr);
    }
  }

  // 3) 멤버 시도 — (학생,문제) 최신 1건. attempted_at asc 페이지네이션(마지막=최신).
  const latest = new Map<
    string,
    { userId: string; problemId: string; correct: boolean }
  >();
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
  if (latest.size === 0) return { cohortSize, threshold, nodes: [] };

  // 4) 시도된 문제의 노드 귀속(이 과목만).
  const attemptedIds = [
    ...new Set([...latest.values()].map((v) => v.problemId)),
  ];
  const problemNodes = new Map<string, string[]>();
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

  // 5) 노드별 집계
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

  // 6) 공통 가드 + 약점 점수 + 정렬
  const nodes: CohortWeakNode[] = [];
  for (const [nid, a] of agg) {
    if (a.students.size < threshold) continue;
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
  return { cohortSize, threshold, nodes: nodes.slice(0, limit) };
}

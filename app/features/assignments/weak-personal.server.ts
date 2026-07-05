// feat-7-045 — 약점 개인 보충 과제 자동 생성.
//
// 학생별: getWeakNodes(개인 약점) → 체계도 노드 문제 시퀀스(approved 필터) →
// pickProblemsFromWeakNodes(가중 배분) → 개인 과제(target_profile_id) 생성.
// session-from-weakness("D")와 동일 선택 규칙 — 싱크만 세션 대신 과제.
//
// adminClient 사용(일괄·cron) — 반 소유권 게이트는 호출측(API/cron)이 선행.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { pickProblemsFromWeakNodes } from "~/features/problems/lib/problem-selection";
import { getSystematicNodeProblemSequence } from "~/features/problems/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";

import {
  addAssignmentProblemItems,
  createAssignment,
} from "./queries.server";

export const WEAK_ASSIGNMENT_TITLE_PREFIX = "약점 보충";

// 학생 1명의 약점 문제 추출 — 최약점 과목 단일 세트.
// session-from-weakness 와 동일 로직(공용 seam). excludeIds = 최근 출제 제외.
export async function pickWeakProblemsForUser(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { subject?: LawSubjectSlug; n: number; excludeIds?: Set<string> },
): Promise<{ lawCode: LawSubjectSlug; problemIds: string[] } | null> {
  const lawCodes = opts.subject ? [opts.subject] : [...LAW_SUBJECT_SLUGS];
  const weak = await getWeakNodes(client, userId, lawCodes, 12);
  if (weak.length === 0) return null;

  const sessionLaw = opts.subject ?? weak[0].lawCode;
  const weakInSubject = weak.filter((w) => w.lawCode === sessionLaw);

  const seqs = await Promise.all(
    weakInSubject.map((w) => getSystematicNodeProblemSequence(client, w.nodeId)),
  );
  const allIds = new Set<string>();
  const rawByNode = new Map<string, string[]>();
  weakInSubject.forEach((w, i) => {
    const ids = (seqs[i]?.problems ?? []).map((p) => p.problemId);
    rawByNode.set(w.nodeId, ids);
    for (const id of ids) allIds.add(id);
  });
  const approved = new Set<string>();
  const idArr = [...allIds];
  for (let i = 0; i < idArr.length; i += 200) {
    const { data: rows } = await client
      .from("problems")
      .select("problem_id")
      .in("problem_id", idArr.slice(i, i + 200))
      .eq("review_status", "approved")
      .is("deleted_at", null);
    for (const r of rows ?? []) approved.add(r.problem_id);
  }
  const problemsByNode = new Map<string, string[]>();
  for (const [nid, ids] of rawByNode) {
    problemsByNode.set(
      nid,
      ids.filter((id) => approved.has(id) && !opts.excludeIds?.has(id)),
    );
  }

  const problemIds = pickProblemsFromWeakNodes(
    weakInSubject.map((w) => ({
      nodeId: w.nodeId,
      weaknessScore: w.weaknessScore,
    })),
    problemsByNode,
    { totalN: opts.n },
  );
  if (problemIds.length === 0) return null;
  return { lawCode: sessionLaw, problemIds };
}

export interface WeakGenerationSummary {
  created: number;
  skippedRecent: number; // 이번 주 이미 생성됨
  skippedNoWeak: number; // 약점 데이터 부족
  skippedNoProblems: number; // 출제 가능 문제 없음
}

// 반 전체 — 학생별 약점 개인 과제 생성. 주 1회 가드 + 최근 4주 출제 제외.
export async function generateWeakAssignmentsForCohort(
  cohortId: string,
  opts: { n?: number; dueDays?: number; createdBy: string },
): Promise<WeakGenerationSummary> {
  const admin = adminClient as SupabaseClient<Database>;
  const n = Math.max(1, Math.min(30, opts.n ?? 10));
  const dueDays = Math.max(1, Math.min(30, opts.dueDays ?? 7));

  const { data: members } = await admin
    .from("cohort_members")
    .select("profile_id, profiles!cohort_members_profile_id_fkey(role)")
    .eq("cohort_id", cohortId);
  const students = (members ?? []).filter(
    (m) => m.profiles?.role === "student",
  );

  const summary: WeakGenerationSummary = {
    created: 0,
    skippedRecent: 0,
    skippedNoWeak: 0,
    skippedNoProblems: 0,
  };
  if (students.length === 0) return summary;

  // 이 반의 최근 개인 약점 과제 — 주 1회 가드(7일) + 최근 출제 제외(28일).
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now - 28 * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from("assignments")
    .select("assignment_id, target_profile_id, assigned_at")
    .eq("cohort_id", cohortId)
    .not("target_profile_id", "is", null)
    .like("title", `${WEAK_ASSIGNMENT_TITLE_PREFIX}%`)
    .gte("assigned_at", monthAgo)
    .is("deleted_at", null);
  const recentList = recent ?? [];
  const thisWeekByUser = new Set(
    recentList
      .filter((r) => r.assigned_at >= weekAgo)
      .map((r) => r.target_profile_id as string),
  );
  // 최근 4주 개인 과제에 출제된 문제 — 학생별 제외 집합.
  const recentAssignmentIds = recentList.map((r) => r.assignment_id);
  const excludeByUser = new Map<string, Set<string>>();
  if (recentAssignmentIds.length > 0) {
    const byAssignment = new Map(
      recentList.map((r) => [r.assignment_id, r.target_profile_id as string]),
    );
    for (let i = 0; i < recentAssignmentIds.length; i += 100) {
      const { data: items } = await admin
        .from("assignment_items")
        .select("assignment_id, problem_id")
        .in("assignment_id", recentAssignmentIds.slice(i, i + 100))
        .eq("kind", "problem");
      for (const it of items ?? []) {
        if (!it.problem_id) continue;
        const uid = byAssignment.get(it.assignment_id);
        if (!uid) continue;
        const set = excludeByUser.get(uid) ?? new Set<string>();
        set.add(it.problem_id);
        excludeByUser.set(uid, set);
      }
    }
  }

  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const weekLabel = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} 주`;
  const dueAt = new Date(now + dueDays * 86_400_000).toISOString();

  for (const st of students) {
    const userId = st.profile_id;
    if (thisWeekByUser.has(userId)) {
      summary.skippedRecent++;
      continue;
    }
    const picked = await pickWeakProblemsForUser(admin, userId, {
      n,
      excludeIds: excludeByUser.get(userId),
    });
    if (!picked) {
      summary.skippedNoWeak++;
      continue;
    }
    if (picked.problemIds.length === 0) {
      summary.skippedNoProblems++;
      continue;
    }

    const created = await createAssignment(admin, {
      cohortId,
      title: `${WEAK_ASSIGNMENT_TITLE_PREFIX} — ${LAW_SUBJECTS[picked.lawCode].name} (${weekLabel})`,
      descriptionMd:
        "최근 풀이 기록에서 정답률이 낮은 단원을 골라 자동 구성된 개인 보충 과제입니다.",
      dueAt,
      createdBy: opts.createdBy,
      targetProfileId: userId,
    });
    if (!created.ok) {
      summary.skippedNoProblems++;
      continue;
    }
    await addAssignmentProblemItems(admin, created.assignmentId, picked.problemIds);
    summary.created++;
  }
  return summary;
}

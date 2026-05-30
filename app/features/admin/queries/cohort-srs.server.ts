// feat-2-018 운영자 SRS 코호트 인사이트 — 한 cohort 의 학생별 SRS 큐 집계.
// 4 종 SRS (객관식 / 빈칸 / OX / 조문 정독) 평균 + 정체 top5.
// admin client RLS 우회. 호출자가 staff + cohort 소유권 확인 후 호출.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface CohortStalledStudent {
  profileId: string;
  name: string;
  totalDue: number;
  problemDue: number;
  blankDueSets: number;
  oxDue: number;
  articleDue: number;
  oldestOverdueDays: number;
}

export interface CohortSrsAggregate {
  memberCount: number;
  /** 학생별 평균 due. */
  avgProblemDue: number;
  avgBlankDueSets: number;
  avgOxDue: number;
  avgArticleDue: number;
  totalLapses: number;
  totalDueAcrossAll: number;
  /** 학생 중 1+ due 보유 비율 (0~1). */
  stalledStudentRatio: number;
  /** 가장 정체된 학생 top 5 (전체 due 합산 내림차순). */
  topStalled: CohortStalledStudent[];
}

const ARTICLE_INTERVALS = [7, 14, 30, 60];

function articleIntervalFor(visits: number): number {
  if (visits <= 1) return 7;
  if (visits === 2) return 14;
  if (visits === 3) return 30;
  return ARTICLE_INTERVALS[ARTICLE_INTERVALS.length - 1];
}

export async function getCohortSrsAggregate(
  cohortId: string,
): Promise<CohortSrsAggregate> {
  const admin = adminClient as SupabaseClient<Database>;
  const nowIso = new Date().toISOString();
  const now = Date.now();

  // 1) 멤버.
  const { data: members } = await admin
    .from("cohort_members")
    .select(
      "profile_id, profiles!cohort_members_profile_id_fkey(name)",
    )
    .eq("cohort_id", cohortId);
  const memberList = (members ?? []).map((m) => ({
    profileId: m.profile_id,
    name: m.profiles?.name ?? "(이름 없음)",
  }));
  const profileIds = memberList.map((m) => m.profileId);

  if (profileIds.length === 0) {
    return {
      memberCount: 0,
      avgProblemDue: 0,
      avgBlankDueSets: 0,
      avgOxDue: 0,
      avgArticleDue: 0,
      totalLapses: 0,
      totalDueAcrossAll: 0,
      stalledStudentRatio: 0,
      topStalled: [],
    };
  }

  // 2) 4 종 SRS bulk fetch (due + lapses).
  const [problemRes, blankRes, oxRes, sessionsRes] = await Promise.all([
    admin
      .from("user_problem_srs")
      .select("user_id, next_due_at, lapses")
      .in("user_id", profileIds)
      .limit(50000),
    admin
      .from("user_blank_srs")
      .select("user_id, set_id, next_due_at, lapses")
      .in("user_id", profileIds)
      .limit(50000),
    admin
      .from("user_ox_ref_srs")
      .select("user_id, next_due_at, lapses")
      .in("user_id", profileIds)
      .limit(50000),
    admin
      .from("study_sessions")
      .select("user_id, scope, started_at")
      .in("user_id", profileIds)
      .order("started_at", { ascending: false })
      .limit(100000),
  ]);

  // 3) 학생별 집계.
  type PerStudent = {
    problemDue: number;
    blankDueSets: Set<string>;
    oxDue: number;
    articleVisits: Map<string, { visits: number; lastIso: string }>;
    lapses: number;
    oldestOverdueMs: number | null;
  };
  const acc = new Map<string, PerStudent>();
  function bucket(uid: string): PerStudent {
    let b = acc.get(uid);
    if (!b) {
      b = {
        problemDue: 0,
        blankDueSets: new Set(),
        oxDue: 0,
        articleVisits: new Map(),
        lapses: 0,
        oldestOverdueMs: null,
      };
      acc.set(uid, b);
    }
    return b;
  }
  function noteOldest(b: PerStudent, ms: number) {
    if (b.oldestOverdueMs === null || ms < b.oldestOverdueMs)
      b.oldestOverdueMs = ms;
  }

  for (const r of problemRes.data ?? []) {
    const b = bucket(r.user_id);
    b.lapses += r.lapses ?? 0;
    const dueMs = new Date(r.next_due_at).getTime();
    if (dueMs <= now) {
      b.problemDue += 1;
      noteOldest(b, dueMs);
    }
  }
  for (const r of blankRes.data ?? []) {
    const b = bucket(r.user_id);
    b.lapses += r.lapses ?? 0;
    const dueMs = new Date(r.next_due_at).getTime();
    if (dueMs <= now) {
      b.blankDueSets.add(r.set_id);
      noteOldest(b, dueMs);
    }
  }
  for (const r of oxRes.data ?? []) {
    const b = bucket(r.user_id);
    b.lapses += r.lapses ?? 0;
    const dueMs = new Date(r.next_due_at).getTime();
    if (dueMs <= now) {
      b.oxDue += 1;
      noteOldest(b, dueMs);
    }
  }
  for (const r of sessionsRes.data ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type !== "article" || !sc.target_id) continue;
    const b = bucket(r.user_id);
    const cur = b.articleVisits.get(sc.target_id);
    if (!cur) {
      b.articleVisits.set(sc.target_id, {
        visits: 1,
        lastIso: r.started_at,
      });
    } else {
      cur.visits += 1;
      if (r.started_at > cur.lastIso) cur.lastIso = r.started_at;
    }
  }

  // 4) 학생별 article due 계산 + 종합 합산.
  let totalProblemDue = 0;
  let totalBlankSets = 0;
  let totalOx = 0;
  let totalArticle = 0;
  let totalLapses = 0;
  let stalledCount = 0;
  const perStudent: CohortStalledStudent[] = [];

  for (const m of memberList) {
    const b = acc.get(m.profileId);
    let articleDue = 0;
    if (b) {
      for (const v of b.articleVisits.values()) {
        const interval = articleIntervalFor(v.visits);
        const dueMs = new Date(v.lastIso).getTime() + interval * 86_400_000;
        if (dueMs <= now) {
          articleDue += 1;
          noteOldest(b, dueMs);
        }
      }
    }
    const blankSets = b ? b.blankDueSets.size : 0;
    const problemDue = b?.problemDue ?? 0;
    const oxDue = b?.oxDue ?? 0;
    const lapses = b?.lapses ?? 0;
    const totalDue = problemDue + blankSets + oxDue + articleDue;
    const oldestOverdueDays =
      b?.oldestOverdueMs !== null && b !== undefined
        ? Math.floor((now - b.oldestOverdueMs) / 86_400_000)
        : 0;

    totalProblemDue += problemDue;
    totalBlankSets += blankSets;
    totalOx += oxDue;
    totalArticle += articleDue;
    totalLapses += lapses;
    if (totalDue > 0) stalledCount += 1;

    perStudent.push({
      profileId: m.profileId,
      name: m.name,
      totalDue,
      problemDue,
      blankDueSets: blankSets,
      oxDue,
      articleDue,
      oldestOverdueDays,
    });
  }

  perStudent.sort((a, b) => b.totalDue - a.totalDue);

  const n = memberList.length;
  return {
    memberCount: n,
    avgProblemDue: n > 0 ? totalProblemDue / n : 0,
    avgBlankDueSets: n > 0 ? totalBlankSets / n : 0,
    avgOxDue: n > 0 ? totalOx / n : 0,
    avgArticleDue: n > 0 ? totalArticle / n : 0,
    totalLapses,
    totalDueAcrossAll: totalProblemDue + totalBlankSets + totalOx + totalArticle,
    stalledStudentRatio: n > 0 ? stalledCount / n : 0,
    topStalled: perStudent.filter((s) => s.totalDue > 0).slice(0, 5),
  };
}

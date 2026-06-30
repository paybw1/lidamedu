// 전체 학습현황 (feat-7-041) — 학원 전체 학생의 집계·익명 통계.
//
// 모집단 = "활성 반(cohort)에 소속된 전체 학생"(반을 가로지른 distinct 집합).
//   · 자습(비종합반) 사용자는 제외 — 약관 제7조(종합반 계약이행)이 닿는 모집단과 일치시켜
//     법적 근거를 명확히 한다(at-risk·반 통계와 동일 모집단). [[admin-cohort-monitoring]]
//   · 개인 식별 없는 집계만 반환(분포·평균·반별 KPI). 개인 드릴다운은 admin-student-detail.
//
// 호출자(loader)는 manager+ 게이트를 선행해야 한다 — instructor 는 담당 반만 보므로
// 전체 조망 권한이 없다.
//
// 비용: summarizeProgressForProfiles(스캔 1) + aggregateStatsFromMembers 의 by-subject(스캔 1).
// 둘 다 distinct 학생 집합 1회 스캔. 무거운 약점·at-risk 는 화면에서 지연 로드한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { listCohorts } from "~/features/cohorts/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import {
  buildProblemNodeAttribution,
  fetchLatestAttemptsForProfiles,
  weakNodesFromLatestAttempts,
} from "./cohort-weakness.server";
import {
  type AccuracyBucket,
  type CohortAggregateStats,
  type CohortMemberProgress,
  aggregateStatsFromMembers,
  summarizeProgressForProfiles,
} from "./student-progress.server";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const AVG_ACCURACY_MIN_ATTEMPTS = 5;

export interface CohortComparisonRow {
  cohortId: string;
  name: string;
  memberCount: number;
  active7dCount: number;
  active7dRate: number | null; // 0~1
  avgAccuracyPct: number | null;
  avgProblemsAttempted: number;
  // 추세 — 최근 14일 vs 직전 14일 정답률(%p), 표본 부족 시 null.
  accuracyDeltaPct: number | null;
  // 활동 추세 — 최근 7일 vs 직전 7일 활동 학생 수 차이.
  activeDelta: number | null;
}

export interface AllStudentsOverview {
  cohortCount: number;
  studentCount: number; // distinct (복수 반 소속도 1명)
  active7dCount: number; // distinct, 최근 7일 활동
  active7dRate: number | null; // 0~1
  avgAccuracyPct: number | null;
  avgProblemsAttempted: number;
  avgArticlesViewed: number;
  // 정답률 분포 (학생 단위 버킷) + 5과목 평균 — aggregateStatsFromMembers 재사용.
  accuracyDistribution: Array<{ bucket: AccuracyBucket; count: number }>;
  bySubject: CohortAggregateStats["bySubject"];
  // 반별 비교 — 같은 진척 데이터를 cohort 로 group(추가 스캔 없음).
  cohorts: CohortComparisonRow[];
}

function avgOrNull(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function isActive7d(p: CohortMemberProgress, now: number): boolean {
  return (
    p.lastActivityAt !== null &&
    now - new Date(p.lastActivityAt).getTime() < SEVEN_DAYS_MS
  );
}
function cohortAvgAccuracy(rows: CohortMemberProgress[]): number | null {
  const valid = rows
    .filter(
      (p) => p.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS && p.accuracyPct !== null,
    )
    .map((p) => p.accuracyPct as number);
  const a = avgOrNull(valid);
  return a === null ? null : round1(a);
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 윈도우별 최소 시도 — 정답률 추세 노이즈 가드(적게 풀면 추세 무의미).
const TREND_MIN_ATTEMPTS = 10;

interface CohortTrendDelta {
  accuracyDeltaPct: number | null; // 최근14d − 직전14d (%p)
  activeDelta: number | null; // 최근7d − 직전7d 활동 학생 수
}

// 반별 추세 델타 — 최근 28일 attempts 1회(날짜 한정) 벌크 스캔.
// 정답률: 최근 14일 vs 직전 14일(표본 ≥10 일 때만). 활동: 최근 7일 vs 직전 7일 활동 학생 수.
async function computeCohortTrendDeltas(
  admin: SupabaseClient<Database>,
  userIds: string[],
  cohortIdsByProfile: Map<string, string[]>,
  now: number,
): Promise<Map<string, CohortTrendDelta>> {
  const result = new Map<string, CohortTrendDelta>();
  if (userIds.length === 0) return result;

  const d7 = now - 7 * DAY_MS;
  const d14 = now - 14 * DAY_MS;
  const d28 = now - 28 * DAY_MS;
  const sinceIso = new Date(d28).toISOString();

  interface Acc {
    recent14: { t: number; c: number };
    prior14: { t: number; c: number };
    recent7: Set<string>;
    prior7: Set<string>;
  }
  const acc = new Map<string, Acc>();
  const ensure = (cid: string): Acc => {
    let e = acc.get(cid);
    if (!e) {
      e = {
        recent14: { t: 0, c: 0 },
        prior14: { t: 0, c: 0 },
        recent7: new Set(),
        prior7: new Set(),
      };
      acc.set(cid, e);
    }
    return e;
  };

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("user_problem_attempts")
      .select("user_id, is_correct, attempted_at")
      .in("user_id", userIds)
      .gte("attempted_at", sinceIso)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const cids = cohortIdsByProfile.get(r.user_id);
      if (!cids) continue;
      const t = new Date(r.attempted_at).getTime();
      const correct = r.is_correct === true;
      for (const cid of cids) {
        const e = ensure(cid);
        if (t >= d14) {
          e.recent14.t++;
          if (correct) e.recent14.c++;
        } else {
          e.prior14.t++;
          if (correct) e.prior14.c++;
        }
        if (t >= d7) e.recent7.add(r.user_id);
        else if (t >= d14) e.prior7.add(r.user_id);
      }
    }
    if (rows.length < PAGE) break;
  }

  for (const [cid, e] of acc) {
    let accuracyDeltaPct: number | null = null;
    if (
      e.recent14.t >= TREND_MIN_ATTEMPTS &&
      e.prior14.t >= TREND_MIN_ATTEMPTS
    ) {
      const recentAcc = (e.recent14.c / e.recent14.t) * 100;
      const priorAcc = (e.prior14.c / e.prior14.t) * 100;
      accuracyDeltaPct = Math.round(recentAcc - priorAcc);
    }
    result.set(cid, {
      accuracyDeltaPct,
      activeDelta: e.recent7.size - e.prior7.size,
    });
  }
  return result;
}

export async function getAllStudentsOverview(): Promise<AllStudentsOverview> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) 활성(비-archived) 반 목록.
  const cohorts = await listCohorts(admin, { includeArchived: false });
  if (cohorts.length === 0) {
    return emptyOverview();
  }
  const cohortIds = cohorts.map((c) => c.cohortId);

  // 2) 멤버십 — (cohort_id, profile_id) + 이름·가입일. distinct roster 구성용.
  const { data: memberRows, error } = await admin
    .from("cohort_members")
    .select("cohort_id, profile_id, joined_at, profiles!cohort_members_profile_id_fkey(name)")
    .in("cohort_id", cohortIds);
  if (error) throw error;
  const memberships = memberRows ?? [];
  if (memberships.length === 0) {
    return emptyOverview(cohorts.length);
  }

  // distinct roster (첫 등장 이름/가입일).
  const rosterMap = new Map<string, { profileId: string; name: string; joinedAt: string }>();
  for (const m of memberships) {
    if (!rosterMap.has(m.profile_id)) {
      rosterMap.set(m.profile_id, {
        profileId: m.profile_id,
        name: m.profiles?.name ?? "",
        joinedAt: m.joined_at,
      });
    }
  }
  const roster = [...rosterMap.values()];

  // 3) 진척 요약(스캔 1) — distinct 학생 1회.
  const progress = await summarizeProgressForProfiles(roster);
  const progressById = new Map(progress.map((p) => [p.profileId, p]));

  // 4) 학원 전체 집계(분포·by-subject) — 공용 집계기 재사용(by-subject 스캔 1).
  const agg = await aggregateStatsFromMembers(progress);

  // 5) 전체 KPI.
  const now = Date.now();
  const active7dCount = progress.filter((p) => isActive7d(p, now)).length;
  const studentCount = progress.length;

  // 6) 반별 비교 — 같은 progress 객체를 cohort 로 group(추가 스캔 없음).
  const byCohort = new Map<string, CohortMemberProgress[]>();
  const cohortIdsByProfile = new Map<string, string[]>();
  for (const m of memberships) {
    const arr2 = cohortIdsByProfile.get(m.profile_id) ?? [];
    arr2.push(m.cohort_id);
    cohortIdsByProfile.set(m.profile_id, arr2);
    const p = progressById.get(m.profile_id);
    if (!p) continue;
    const arr = byCohort.get(m.cohort_id) ?? [];
    arr.push(p);
    byCohort.set(m.cohort_id, arr);
  }

  // 6b) 반별 추세 델타(최근 28일 1회 스캔).
  const deltaByCohort = await computeCohortTrendDeltas(
    admin,
    roster.map((r) => r.profileId),
    cohortIdsByProfile,
    now,
  );

  const cohortRows: CohortComparisonRow[] = cohorts
    .map((c) => {
      const rows = byCohort.get(c.cohortId) ?? [];
      const active = rows.filter((p) => isActive7d(p, now)).length;
      const delta = deltaByCohort.get(c.cohortId);
      return {
        cohortId: c.cohortId,
        name: c.name,
        memberCount: rows.length,
        active7dCount: active,
        active7dRate: rows.length > 0 ? active / rows.length : null,
        avgAccuracyPct: cohortAvgAccuracy(rows),
        avgProblemsAttempted:
          rows.length > 0
            ? round1(avgOrNull(rows.map((p) => p.problemsAttempted)) ?? 0)
            : 0,
        accuracyDeltaPct: delta?.accuracyDeltaPct ?? null,
        activeDelta: delta?.activeDelta ?? null,
      };
    })
    .filter((r) => r.memberCount > 0)
    // 정답률 낮은(가장 도움 필요한) 반이 위로 — null 은 맨 아래.
    .sort((a, b) => {
      if (a.avgAccuracyPct === null) return 1;
      if (b.avgAccuracyPct === null) return -1;
      return a.avgAccuracyPct - b.avgAccuracyPct;
    });

  return {
    cohortCount: cohorts.length,
    studentCount,
    active7dCount,
    active7dRate: studentCount > 0 ? active7dCount / studentCount : null,
    avgAccuracyPct: agg.avgAccuracyPct,
    avgProblemsAttempted: agg.avgProblemsAttempted,
    avgArticlesViewed: agg.avgArticlesViewed,
    accuracyDistribution: agg.accuracyDistribution,
    bySubject: agg.bySubject,
    cohorts: cohortRows,
  };
}

// 활성(비-보관) 반에 소속된 distinct 학생 id — 전체 약점 등 모집단 공용.
export async function listActiveCohortStudentIds(): Promise<string[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const cohorts = await listCohorts(admin, { includeArchived: false });
  if (cohorts.length === 0) return [];
  const { data, error } = await admin
    .from("cohort_members")
    .select("profile_id")
    .in(
      "cohort_id",
      cohorts.map((c) => c.cohortId),
    );
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.profile_id))];
}

/* ── ⑥ 전체 공통 약점 단원 (지연 로드 — 무거움) ──────────────────────── */

export interface OverallWeakNode {
  nodeId: string;
  lawCode: string;
  lawName: string;
  displayLabel: string;
  accuracyPct: number;
  distinctStudents: number;
  attempts: number;
  weaknessScore: number;
}

export interface OverallWeaknessResult {
  populationSize: number;
  // "공통 약점"으로 잡히는 데 필요한 시도 학생 수(전체 모집단 정책).
  threshold: number;
  nodes: OverallWeakNode[];
}

// 전체 모집단(활성 반 distinct 학생)의 공통 약점 단원 — 5과목 가로질러 merge.
// ★ 시도 스캔은 fetchLatestAttemptsForProfiles 로 1회만, 5과목은 같은 맵 재사용.
// 공통 가드(threshold)는 학원 규모 비례(minRatio 0.15·floor 3) — 반 단위(0.3)보다 완화.
export async function getAllStudentsWeakNodes(opts?: {
  limit?: number;
}): Promise<OverallWeaknessResult> {
  const admin = adminClient as SupabaseClient<Database>;
  const limit = opts?.limit ?? 8;
  const minRatio = 0.15;
  const floorStudents = 3;
  const minAttempts = 5;
  const perSubjectLimit = 8;

  const userIds = await listActiveCohortStudentIds();
  const populationSize = userIds.length;
  const threshold = Math.max(floorStudents, Math.ceil(minRatio * populationSize));
  if (populationSize === 0) return { populationSize, threshold, nodes: [] };

  const latest = await fetchLatestAttemptsForProfiles(admin, userIds);
  if (latest.size === 0) return { populationSize, threshold, nodes: [] };

  const merged: OverallWeakNode[] = [];
  for (const slug of LAW_SUBJECT_SLUGS) {
    const nodes = await weakNodesFromLatestAttempts(admin, latest, slug, {
      threshold,
      minAttempts,
      limit: perSubjectLimit,
    });
    for (const n of nodes) {
      merged.push({
        nodeId: n.nodeId,
        lawCode: slug,
        lawName: LAW_SUBJECTS[slug].name,
        displayLabel: n.displayLabel,
        accuracyPct: n.accuracyPct,
        distinctStudents: n.distinctStudents,
        attempts: n.attempts,
        weaknessScore: n.weaknessScore,
      });
    }
  }
  merged.sort((a, b) => b.weaknessScore - a.weaknessScore);
  return { populationSize, threshold, nodes: merged.slice(0, limit) };
}

/* ── ⑥-드릴다운: 한 약점 단원 → 약한 반·학생 역추적 ──────────────────── */

export interface WeakNodeCohortRow {
  cohortId: string;
  name: string;
  accuracyPct: number;
  distinctStudents: number;
  attempts: number;
}

export interface WeakNodeStudentRow {
  profileId: string;
  name: string;
  accuracyPct: number;
  attempts: number;
  cohortNames: string[];
}

export interface WeakNodeBreakdown {
  found: boolean;
  cohorts: WeakNodeCohortRow[]; // 정답률 낮은 반 우선
  students: WeakNodeStudentRow[]; // 정답률 낮은 학생 우선
}

// 한 약점 단원(lawCode+nodeId)에 대해 그 단원 문제를 푼 반별 정답률 + 학생 명단.
// manager+ 전용 화면에서만 호출(개인 식별 노출 — 약관 제7조 근거). 시도 스캔 1회.
export async function getWeakNodeBreakdown(
  lawCode: LawSubjectSlug,
  nodeId: string,
): Promise<WeakNodeBreakdown> {
  const admin = adminClient as SupabaseClient<Database>;

  const cohorts = await listCohorts(admin, { includeArchived: false });
  if (cohorts.length === 0) return { found: false, cohorts: [], students: [] };
  const cohortNameById = new Map(cohorts.map((c) => [c.cohortId, c.name]));

  const { data: memberRows, error } = await admin
    .from("cohort_members")
    .select("cohort_id, profile_id, profiles!cohort_members_profile_id_fkey(name)")
    .in(
      "cohort_id",
      cohorts.map((c) => c.cohortId),
    );
  if (error) throw error;
  const nameById = new Map<string, string>();
  const cohortsByProfile = new Map<
    string,
    Array<{ cohortId: string; name: string }>
  >();
  for (const m of memberRows ?? []) {
    if (!nameById.has(m.profile_id))
      nameById.set(m.profile_id, m.profiles?.name ?? "");
    const cn = cohortNameById.get(m.cohort_id);
    if (!cn) continue;
    const arr = cohortsByProfile.get(m.profile_id) ?? [];
    arr.push({ cohortId: m.cohort_id, name: cn });
    cohortsByProfile.set(m.profile_id, arr);
  }
  const userIds = [...nameById.keys()];
  if (userIds.length === 0) return { found: false, cohorts: [], students: [] };

  const latest = await fetchLatestAttemptsForProfiles(admin, userIds);
  const attemptedIds = [
    ...new Set([...latest.values()].map((v) => v.problemId)),
  ];
  const { problemNodes } = await buildProblemNodeAttribution(
    admin,
    attemptedIds,
    lawCode,
  );

  // 이 노드에 속한 문제만 — 학생·반 단위 집계.
  const perStudent = new Map<string, { attempts: number; correct: number }>();
  const perCohort = new Map<
    string,
    { attempts: number; correct: number; students: Set<string> }
  >();
  for (const v of latest.values()) {
    const nodeIds = problemNodes.get(v.problemId);
    if (!nodeIds || !nodeIds.includes(nodeId)) continue;
    const s = perStudent.get(v.userId) ?? { attempts: 0, correct: 0 };
    s.attempts++;
    if (v.correct) s.correct++;
    perStudent.set(v.userId, s);
    for (const c of cohortsByProfile.get(v.userId) ?? []) {
      const cc = perCohort.get(c.cohortId) ?? {
        attempts: 0,
        correct: 0,
        students: new Set<string>(),
      };
      cc.attempts++;
      if (v.correct) cc.correct++;
      cc.students.add(v.userId);
      perCohort.set(c.cohortId, cc);
    }
  }

  const students: WeakNodeStudentRow[] = [...perStudent.entries()]
    .map(([pid, s]) => ({
      profileId: pid,
      name: nameById.get(pid) ?? "",
      accuracyPct: Math.round((s.correct / s.attempts) * 100),
      attempts: s.attempts,
      cohortNames: (cohortsByProfile.get(pid) ?? []).map((c) => c.name),
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempts - a.attempts);

  const cohortRows: WeakNodeCohortRow[] = [...perCohort.entries()]
    .map(([cid, c]) => ({
      cohortId: cid,
      name: cohortNameById.get(cid) ?? "",
      accuracyPct: Math.round((c.correct / c.attempts) * 100),
      distinctStudents: c.students.size,
      attempts: c.attempts,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct);

  return { found: students.length > 0, cohorts: cohortRows, students };
}

function emptyOverview(cohortCount = 0): AllStudentsOverview {
  return {
    cohortCount,
    studentCount: 0,
    active7dCount: 0,
    active7dRate: null,
    avgAccuracyPct: null,
    avgProblemsAttempted: 0,
    avgArticlesViewed: 0,
    accuracyDistribution: (
      ["80+", "60-79", "40-59", "20-39", "0-19", "none"] as AccuracyBucket[]
    ).map((b) => ({ bucket: b, count: 0 })),
    bySubject: [],
    cohorts: [],
  };
}

// feat-7-035 수강생 위험군 통합 큐 — cross-cohort 집계.
// feat-8-014 의 단일 cohort getAtRiskStudents 를 모든 visible cohort 에 대해 호출 + 학생 dedupe.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { roleAtLeast, type UserRole } from "~/core/lib/roles";
import { listCohorts } from "~/features/cohorts/queries.server";
import {
  type AtRiskStudent,
  type AtRiskSummary,
  getAtRiskStudents,
} from "~/features/exam-results/at-risk.server";

export interface CrossCohortAtRiskStudent extends AtRiskStudent {
  /** 학생이 속한 cohort 의 (가장 위험 점수 높았던) 정보. dedupe 우선. */
  cohortId: string;
  cohortName: string;
}

export interface CrossCohortAtRiskOptions {
  /** 호출자 역할 — instructor 는 owner=본인 cohort 만, manager+ 는 전체. */
  callerRole: UserRole;
  callerId: string;
  /** 특정 cohort 한정 (드롭다운 필터). */
  cohortId?: string;
  /** risk 레벨 필터. */
  riskLevel?: "high" | "medium" | "low";
}

export interface CrossCohortAtRiskSummary {
  students: CrossCohortAtRiskStudent[]; // 위험 점수 내림차순
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  cohorts: Array<{ cohortId: string; name: string }>;
  baselineSampleSize: number | null;
}

export async function getCrossCohortAtRisk(
  client: SupabaseClient<Database>,
  opts: CrossCohortAtRiskOptions,
): Promise<CrossCohortAtRiskSummary> {
  // instructor 는 본인 소유 cohort, manager+ 는 전체.
  const isStaffPlus = roleAtLeast(opts.callerRole, "manager");
  const cohorts = await listCohorts(client, {
    ownerId: isStaffPlus ? undefined : opts.callerId,
    includeArchived: false,
  });

  const targetCohorts = opts.cohortId
    ? cohorts.filter((c) => c.cohortId === opts.cohortId)
    : cohorts;

  if (targetCohorts.length === 0) {
    return {
      students: [],
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      cohorts: cohorts.map((c) => ({ cohortId: c.cohortId, name: c.name })),
      baselineSampleSize: null,
    };
  }

  // 병렬로 각 cohort 의 AtRiskSummary 수집.
  const summaries: Array<{
    summary: AtRiskSummary;
    cohortId: string;
    cohortName: string;
  }> = await Promise.all(
    targetCohorts.map(async (c) => ({
      summary: await getAtRiskStudents(c.cohortId),
      cohortId: c.cohortId,
      cohortName: c.name,
    })),
  );

  // dedupe — 같은 profile_id 가 여러 cohort 에 있으면 risk 점수 가장 높은 것만 유지.
  const byProfileId = new Map<string, CrossCohortAtRiskStudent>();
  for (const { summary, cohortId, cohortName } of summaries) {
    for (const s of summary.students) {
      const existing = byProfileId.get(s.profileId);
      if (!existing || s.riskScore > existing.riskScore) {
        byProfileId.set(s.profileId, { ...s, cohortId, cohortName });
      }
    }
  }

  let students = Array.from(byProfileId.values());
  if (opts.riskLevel) {
    students = students.filter((s) => s.riskLevel === opts.riskLevel);
  }
  students.sort((a, b) => b.riskScore - a.riskScore);

  return {
    students,
    highRiskCount: students.filter((s) => s.riskLevel === "high").length,
    mediumRiskCount: students.filter((s) => s.riskLevel === "medium").length,
    lowRiskCount: students.filter((s) => s.riskLevel === "low").length,
    cohorts: cohorts.map((c) => ({ cohortId: c.cohortId, name: c.name })),
    baselineSampleSize: summaries[0]?.summary.baseline?.sampleSize ?? null,
  };
}

/**
 * 호출자가 알림을 보낼 수 있는 학생 profile_id 집합(쓰기 게이트용 권위 소스).
 * 스코프는 위 getCrossCohortAtRisk 와 동일 — instructor 는 본인 소유 cohort,
 * manager+ 는 전체. at-risk 여부가 아니라 **cohort 멤버십**으로 판정한다
 * (risk 점수는 매 로드 재계산되므로 at-risk 기준이면 false rejection 발생).
 *
 * cohortId 목록은 listCohorts(ownerId 스코프) 로 owner 게이트가 이미 적용된 뒤이므로,
 * 멤버 조회는 adminClient 로 해도 안전하다(cohort_members 는 student self-read RLS 부재).
 */
export async function getNotifiableStudentIds(
  client: SupabaseClient<Database>,
  opts: { callerRole: UserRole; callerId: string },
): Promise<Set<string>> {
  const isStaffPlus = roleAtLeast(opts.callerRole, "manager");
  const cohorts = await listCohorts(client, {
    ownerId: isStaffPlus ? undefined : opts.callerId,
    includeArchived: false,
  });
  if (cohorts.length === 0) return new Set();

  const { data: rows, error } = await adminClient
    .from("cohort_members")
    .select("profile_id")
    .in(
      "cohort_id",
      cohorts.map((c) => c.cohortId),
    );
  if (error) throw error;
  return new Set((rows ?? []).map((r) => r.profile_id));
}

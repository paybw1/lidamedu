// Phase 3 — 진단·월간 계획 서버 쿼리.
// 학생 쓰기 = 요청 클라이언트(RLS 소유권) / staff = staff RLS + API 액션의 반 소유권 게이트.
// 승인 전이만 RPC(approve_study_plan — supersede+approve 원자성, 승인 2.3).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { sortSystematicTreeOrder } from "~/features/laws/lib/systematic-order";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import {
  computeOverloadIndex,
  type AttemptType,
  type DayScope,
  type LectureStage,
  type OverloadIndex,
  type PlanActivityType,
  type PlanStatus,
  type ScienceTier,
  type SubjectKind,
  type TierSource,
} from "./labels";

// ── 진단 ─────────────────────────────────────────────────────────────────────

export interface StudentDiagnostics {
  userId: string;
  cohortId: string;
  attemptType: AttemptType;
  weekdayMinutes: number;
  weekendMinutes: number;
  note: string | null;
  updatedAt: string;
}

export async function getStudentDiagnostics(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StudentDiagnostics | null> {
  const { data, error } = await client
    .from("student_diagnostics")
    .select("user_id, cohort_id, attempt_type, weekday_minutes, weekend_minutes, note, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    cohortId: data.cohort_id,
    attemptType: data.attempt_type as AttemptType,
    weekdayMinutes: data.weekday_minutes,
    weekendMinutes: data.weekend_minutes,
    note: data.note,
    updatedAt: data.updated_at,
  };
}

export async function upsertStudentDiagnostics(
  client: SupabaseClient<Database>,
  input: {
    userId: string;
    cohortId: string;
    attemptType: AttemptType;
    weekdayMinutes: number;
    weekendMinutes: number;
    note: string | null;
    updatedBy: string;
  },
): Promise<void> {
  const { error } = await client.from("student_diagnostics").upsert(
    {
      user_id: input.userId,
      cohort_id: input.cohortId,
      attempt_type: input.attemptType,
      weekday_minutes: input.weekdayMinutes,
      weekend_minutes: input.weekendMinutes,
      note: input.note,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export interface SubjectStatusRow {
  subjectKind: SubjectKind;
  subjectCode: string;
  lectureStage: LectureStage | null;
  scienceTier: ScienceTier | null;
  scienceScore: number | null;
  scienceTotal: number | null;
  tierSource: TierSource | null;
  diagnosticTestId: string | null;
  completedLectures: string | null;
  direction: string | null;
  updatedAt: string;
}

export async function listSubjectStatus(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SubjectStatusRow[]> {
  const { data, error } = await client
    .from("student_subject_status")
    .select(
      "subject_kind, subject_code, lecture_stage, science_tier, science_score, science_total, tier_source, diagnostic_test_id, completed_lectures, direction, updated_at",
    )
    .eq("user_id", userId)
    .order("subject_kind")
    .order("subject_code");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    subjectKind: r.subject_kind as SubjectKind,
    subjectCode: r.subject_code,
    lectureStage: r.lecture_stage as LectureStage | null,
    scienceTier: r.science_tier as ScienceTier | null,
    scienceScore: r.science_score,
    scienceTotal: r.science_total,
    tierSource: r.tier_source as TierSource | null,
    diagnosticTestId: r.diagnostic_test_id,
    completedLectures: r.completed_lectures,
    direction: r.direction,
    updatedAt: r.updated_at,
  }));
}

// 수기 저장 — tier 를 수기로 만지면 source=manual 전환(진단 test_id 는 참조로 유지).
export async function upsertSubjectStatusManual(
  client: SupabaseClient<Database>,
  input: {
    userId: string;
    subjectKind: SubjectKind;
    subjectCode: string;
    lectureStage: LectureStage | null;
    scienceTier: ScienceTier | null;
    completedLectures: string | null;
    direction: string | null;
    updatedBy: string;
  },
): Promise<void> {
  const { error } = await client.from("student_subject_status").upsert(
    {
      user_id: input.userId,
      subject_kind: input.subjectKind,
      subject_code: input.subjectCode,
      lecture_stage: input.lectureStage,
      science_tier: input.scienceTier,
      tier_source: input.scienceTier !== null ? "manual" : null,
      completed_lectures: input.completedLectures,
      direction: input.direction,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject_kind,subject_code" },
  );
  if (error) throw error;
}

// ── 계획 ─────────────────────────────────────────────────────────────────────

export interface StudyPlan {
  planId: string;
  userId: string;
  cohortId: string;
  periodStart: string;
  periodEnd: string;
  version: number;
  rootPlanId: string | null;
  status: PlanStatus;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  baselineLockedAt: string | null;
  plannedWeekdayMinutes: number | null;
  plannedWeekendMinutes: number | null;
}

export interface StudyPlanItem {
  itemId: string;
  planId: string;
  priority: number | null;
  title: string;
  nodeId: string | null;
  lessonId: string | null;
  activityType: PlanActivityType;
  dailyMinutes: number;
  dayScope: DayScope;
  startDate: string;
  endDate: string;
  isLocked: boolean;
}

const PLAN_SELECT =
  "plan_id, user_id, cohort_id, period_start, period_end, version, root_plan_id, status, submitted_at, reviewed_by, reviewed_at, review_comment, baseline_locked_at, planned_weekday_minutes, planned_weekend_minutes";

function rowToPlan(r: Record<string, unknown>): StudyPlan {
  return {
    planId: r.plan_id as string,
    userId: r.user_id as string,
    cohortId: r.cohort_id as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    version: r.version as number,
    rootPlanId: (r.root_plan_id as string | null) ?? null,
    status: r.status as PlanStatus,
    submittedAt: (r.submitted_at as string | null) ?? null,
    reviewedBy: (r.reviewed_by as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    reviewComment: (r.review_comment as string | null) ?? null,
    baselineLockedAt: (r.baseline_locked_at as string | null) ?? null,
    plannedWeekdayMinutes: (r.planned_weekday_minutes as number | null) ?? null,
    plannedWeekendMinutes: (r.planned_weekend_minutes as number | null) ?? null,
  };
}

/** 해당 기간의 현재 유효 계획 — in-flight 우선, 없으면 approved. */
export async function getActivePlan(
  client: SupabaseClient<Database>,
  userId: string,
  periodStart: string,
): Promise<StudyPlan | null> {
  const { data, error } = await client
    .from("study_plans")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .in("status", ["draft", "submitted", "revision_requested", "approved"])
    .order("version", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const inflight = rows.find((r) =>
    ["draft", "submitted", "revision_requested"].includes(r.status as string),
  );
  return rowToPlan((inflight ?? rows[0]) as Record<string, unknown>);
}

/** 이번 달 계획 변경 횟수(승인 2.2 가시화) — (user, period) 전체 버전 수. */
export async function countPlanVersions(
  client: SupabaseClient<Database>,
  userId: string,
  periodStart: string,
): Promise<number> {
  const { count, error } = await client
    .from("study_plans")
    .select("plan_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("period_start", periodStart);
  if (error) throw error;
  return count ?? 0;
}

export async function listPlanItems(
  client: SupabaseClient<Database>,
  planId: string,
): Promise<StudyPlanItem[]> {
  const { data, error } = await client
    .from("study_plan_items")
    .select(
      "item_id, plan_id, priority, title, node_id, lesson_id, activity_type, daily_minutes, day_scope, start_date, end_date, is_locked",
    )
    .eq("plan_id", planId)
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    planId: r.plan_id,
    priority: r.priority,
    title: r.title,
    nodeId: r.node_id,
    lessonId: r.lesson_id,
    activityType: r.activity_type as PlanActivityType,
    dailyMinutes: r.daily_minutes,
    dayScope: r.day_scope as DayScope,
    startDate: r.start_date,
    endDate: r.end_date,
    isLocked: r.is_locked,
  }));
}

/** 승인 후 수정 — 새 버전 draft 생성 + 항목 복사 (in-flight 유니크가 중복 차단). */
export async function createPlanRevision(
  client: SupabaseClient<Database>,
  approvedPlanId: string,
  userId: string,
): Promise<string> {
  const { data: base, error } = await client
    .from("study_plans")
    .select(PLAN_SELECT)
    .eq("plan_id", approvedPlanId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw error;
  if (!base) throw new Error("승인된 계획을 찾을 수 없습니다");

  const { data: created, error: cErr } = await client
    .from("study_plans")
    .insert({
      user_id: userId,
      cohort_id: base.cohort_id,
      period_start: base.period_start,
      period_end: base.period_end,
      version: base.version + 1,
      root_plan_id: base.root_plan_id ?? base.plan_id,
      status: "draft",
    })
    .select("plan_id")
    .single();
  if (cErr) throw cErr;

  const items = await listPlanItems(client, approvedPlanId);
  if (items.length > 0) {
    const { error: iErr } = await client.from("study_plan_items").insert(
      items.map((i) => ({
        plan_id: created.plan_id,
        priority: i.priority,
        title: i.title,
        node_id: i.nodeId,
        lesson_id: i.lessonId,
        activity_type: i.activityType,
        daily_minutes: i.dailyMinutes,
        day_scope: i.dayScope,
        start_date: i.startDate,
        end_date: i.endDate,
        is_locked: false,
      })),
    );
    if (iErr) throw iErr;
  }
  return created.plan_id;
}

// ── 승인 큐·검토 신호 (staff) ────────────────────────────────────────────────

export interface ReviewQueueRow {
  planId: string;
  userId: string;
  name: string;
  status: PlanStatus;
  version: number;
  submittedAt: string | null;
  itemCount: number;
  hasDiagnostics: boolean;
}

export async function listCohortPlanOverview(
  client: SupabaseClient<Database>,
  cohortId: string,
  periodStart: string,
): Promise<Map<string, { plan: StudyPlan; itemCount: number }>> {
  const { data, error } = await client
    .from("study_plans")
    .select(PLAN_SELECT)
    .eq("cohort_id", cohortId)
    .eq("period_start", periodStart)
    .in("status", ["draft", "submitted", "revision_requested", "approved"]);
  if (error) throw error;
  const rows = (data ?? []).map((r) => rowToPlan(r as Record<string, unknown>));
  const byUser = new Map<string, StudyPlan>();
  for (const p of rows) {
    const cur = byUser.get(p.userId);
    // in-flight 우선(학생당 최대 in-flight 1 + approved 1)
    if (!cur || p.status !== "approved") byUser.set(p.userId, p);
  }
  const planIds = [...byUser.values()].map((p) => p.planId);
  const countByPlan = new Map<string, number>();
  if (planIds.length > 0) {
    const { data: items, error: iErr } = await client
      .from("study_plan_items")
      .select("plan_id")
      .in("plan_id", planIds);
    if (iErr) throw iErr;
    for (const it of items ?? []) {
      countByPlan.set(it.plan_id, (countByPlan.get(it.plan_id) ?? 0) + 1);
    }
  }
  const out = new Map<string, { plan: StudyPlan; itemCount: number }>();
  for (const [uid, plan] of byUser) {
    out.set(uid, { plan, itemCount: countByPlan.get(plan.planId) ?? 0 });
  }
  return out;
}

export interface WeaknessAvoidanceSignal {
  topWeakNodes: Array<{ nodeId: string; displayLabel: string; lawCode: string; accuracyPct: number }>;
  avoidedCount: number;
  /** 상위 약점 중 계획에 없는 비율 (0~1). 약점 표본 없으면 null. */
  avoidanceRatio: number | null;
}

/** 승인 보조 신호 — 과욕 지수(서버) + 약점 회피. */
export async function computeReviewSignals(
  client: SupabaseClient<Database>,
  userId: string,
  items: StudyPlanItem[],
  diagnostics: StudentDiagnostics | null,
): Promise<{ overload: OverloadIndex; weakness: WeaknessAvoidanceSignal }> {
  const overload = computeOverloadIndex(
    items.map((i) => ({ dailyMinutes: i.dailyMinutes, dayScope: i.dayScope })),
    diagnostics?.weekdayMinutes ?? null,
    diagnostics?.weekendMinutes ?? null,
  );

  // 약점 회피 — 체계도가 있는 법 4과목 대상.
  const lawCodes: LawSubjectSlug[] = ["patent", "trademark", "design", "civil"];
  const weak = await getWeakNodes(client, userId, lawCodes, 5);
  const planNodeIds = new Set(items.map((i) => i.nodeId).filter((v): v is string => !!v));
  const avoided = weak.filter((w) => !planNodeIds.has(w.nodeId));
  return {
    overload,
    weakness: {
      topWeakNodes: weak.map((w) => ({
        nodeId: w.nodeId,
        displayLabel: w.displayLabel,
        lawCode: w.lawCode,
        accuracyPct: w.accuracyPct,
      })),
      avoidedCount: avoided.length,
      avoidanceRatio: weak.length > 0 ? avoided.length / weak.length : null,
    },
  };
}

// ── 노드 선택기 데이터 ───────────────────────────────────────────────────────

export interface PlanNodeOption {
  nodeId: string;
  displayLabel: string;
  depth: number;
}

/** 계획용 노드 목록 — 비 case_only, 트리 표시순(parent+ord DFS), depth 포함. */
export async function listPlanNodes(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<PlanNodeOption[]> {
  const { data, error } = await client
    .from("systematic_nodes")
    .select("node_id, parent_id, path, display_label, ord, case_only")
    .eq("law_code", lawCode)
    .order("path");
  if (error) throw error;
  const sorted = sortSystematicTreeOrder(
    (data ?? []).map((n) => ({
      nodeId: n.node_id,
      parentId: n.parent_id,
      path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
      ord: n.ord,
      displayLabel: n.display_label,
      caseOnly: n.case_only ?? false,
    })),
  );
  return sorted
    .filter((n) => !n.caseOnly)
    .map((n) => ({
      nodeId: n.nodeId,
      displayLabel: n.displayLabel,
      depth: Math.max(0, n.path.split(".").length - 2),
    }));
}

/** 최근 사용 노드 — 본인 계획 항목에서 최근순 distinct (기본 진입점 2). */
export async function listRecentPlanNodes(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 8,
): Promise<Array<{ nodeId: string; displayLabel: string }>> {
  const { data, error } = await client
    .from("study_plan_items")
    .select("node_id, created_at, study_plans!inner(user_id), systematic_nodes(display_label)")
    .eq("study_plans.user_id", userId)
    .not("node_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const seen = new Set<string>();
  const out: Array<{ nodeId: string; displayLabel: string }> = [];
  for (const r of data ?? []) {
    if (!r.node_id || seen.has(r.node_id)) continue;
    seen.add(r.node_id);
    out.push({
      nodeId: r.node_id,
      displayLabel: r.systematic_nodes?.display_label ?? "(노드)",
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── lesson resolver ──────────────────────────────────────────────────────────

/** lesson → node 해석. 매핑 없으면 null (UI "노드 미연결" — 숨기지 않는다). */
export async function resolveLessonNode(
  client: SupabaseClient<Database>,
  lessonId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("lesson_node_links")
    .select("node_id")
    .eq("lesson_id", lessonId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.node_id ?? null;
}

// ── F3 — 기간 겹침 반 과제 (표시 전용, 복제 금지) ────────────────────────────

export interface PeriodAssignment {
  assignmentId: string;
  title: string;
  dueAt: string;
}

export async function listPeriodAssignments(
  client: SupabaseClient<Database>,
  cohortId: string,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PeriodAssignment[]> {
  const { data, error } = await client
    .from("assignments")
    .select("assignment_id, title, due_at, target_profile_id")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .gte("due_at", `${periodStart}T00:00:00+09:00`)
    .lte("due_at", `${periodEnd}T23:59:59+09:00`)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((a) => !a.target_profile_id || a.target_profile_id === userId)
    .map((a) => ({ assignmentId: a.assignment_id, title: a.title, dueAt: a.due_at }));
}

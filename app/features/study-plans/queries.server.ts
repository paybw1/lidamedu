// Phase 3 — 진단·월간 계획 서버 쿼리.
// 학생 쓰기 = 요청 클라이언트(RLS 소유권) / staff = staff RLS + API 액션의 반 소유권 게이트.
// 승인 전이만 RPC(approve_study_plan — supersede+approve 원자성, 승인 2.3).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { sortSystematicTreeOrder } from "~/features/laws/lib/systematic-order";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import {
  addDaysISO,
  computePlanMetrics,
  expectedDaysInRange,
} from "./lib/expected-items";

import {
  computeOverloadIndex,
  type AttemptType,
  type BasicCourseStatus,
  type DayScope,
  type LectureStage,
  type StudyDirection,
  type OverloadIndex,
  type PlanActivityType,
  type PlanStatus,
  type ScienceTier,
  type SubjectKind,
  type TierSource,
} from "./labels";

import { isValidSubject } from "./subject-axis";

// ── 진단 ─────────────────────────────────────────────────────────────────────

export interface StudentDiagnostics {
  userId: string;
  cohortId: string;
  attemptType: AttemptType;
  weekdayMinutes: number;
  weekendMinutes: number;
  /** 수험 진입 시기 — 수험 개월수는 저장하지 않고 필요할 때 계산한다. */
  entryYear: number | null;
  entryMonth: number | null;
  note: string | null;
  updatedAt: string;
}

export async function getStudentDiagnostics(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StudentDiagnostics | null> {
  const { data, error } = await client
    .from("student_diagnostics")
    .select(
      "user_id, cohort_id, attempt_type, weekday_minutes, weekend_minutes, entry_year, entry_month, note, updated_at",
    )
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
    entryYear: data.entry_year,
    entryMonth: data.entry_month,
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
    entryYear: number | null;
    entryMonth: number | null;
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
      entry_year: input.entryYear,
      entry_month: input.entryMonth,
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
  /** @deprecated basicCourseStatus 로 대체(feat-7-048 D3) — 지난 상담 기록 표시용으로만 읽는다. */
  lectureStage: LectureStage | null;
  basicCourseStatus: BasicCourseStatus | null;
  studyDirection: StudyDirection | null;
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
      "subject_kind, subject_code, lecture_stage, basic_course_status, study_direction, science_tier, science_score, science_total, tier_source, diagnostic_test_id, completed_lectures, direction, updated_at",
    )
    .eq("user_id", userId)
    .order("subject_kind")
    .order("subject_code");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    subjectKind: r.subject_kind as SubjectKind,
    subjectCode: r.subject_code,
    lectureStage: r.lecture_stage as LectureStage | null,
    basicCourseStatus: r.basic_course_status as BasicCourseStatus | null,
    studyDirection: r.study_direction as StudyDirection | null,
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
    basicCourseStatus: BasicCourseStatus | null;
    studyDirection: StudyDirection | null;
    scienceTier: ScienceTier | null;
    updatedBy: string;
  },
): Promise<void> {
  // ★lecture_stage·completed_lectures·direction 은 페이로드에 넣지 않는다 —
  //   upsert 는 보낸 컬럼만 갱신하므로 지난 상담 기록이 그대로 보존된다.
  const { error } = await client.from("student_subject_status").upsert(
    {
      user_id: input.userId,
      subject_kind: input.subjectKind,
      subject_code: input.subjectCode,
      basic_course_status: input.basicCourseStatus,
      study_direction: input.studyDirection,
      science_tier: input.scienceTier,
      tier_source: input.scienceTier !== null ? "manual" : null,
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
  /** 상담자가 직접 쓴 계획이면 그 staff id — 학생이 쓴 계획은 null(feat-7-048). */
  authoredBy: string | null;
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
  /** 상담자가 이 항목을 손봤으면 그 staff id — 학생 경로는 채우지 않는다(feat-7-048). */
  updatedBy: string | null;
  /** 과목 축(feat-7-048) — 법과목은 노드에서 파생, 자연과학·기타는 선택. NULL=미분류. */
  subjectKind: string | null;
  subjectCode: string | null;
}

const PLAN_SELECT =
  "plan_id, user_id, cohort_id, period_start, period_end, version, root_plan_id, status, submitted_at, reviewed_by, reviewed_at, review_comment, baseline_locked_at, planned_weekday_minutes, planned_weekend_minutes, authored_by";

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
    authoredBy: (r.authored_by as string | null) ?? null,
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
      "item_id, plan_id, priority, title, node_id, lesson_id, activity_type, daily_minutes, day_scope, start_date, end_date, is_locked, updated_by, subject_kind, subject_code",
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
    updatedBy: r.updated_by,
    subjectKind: r.subject_kind,
    subjectCode: r.subject_code,
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
        // ★과목 축도 함께 복사한다 — 빠뜨리면 자연과학 항목은 노드가 없어
        //   조회 파생으로도 못 살리고 영구 미분류가 된다(feat-7-048 D5).
        subject_kind: i.subjectKind,
        subject_code: i.subjectCode,
        is_locked: false,
      })),
    );
    if (iErr) throw iErr;
  }
  return created.plan_id;
}

/**
 * 상담자가 편집할 계획을 확보한다(feat-7-048 D9).
 *
 * 파셜 유니크가 in-flight 1개만 허용하므로 **새로 만들지 않고 있는 것을 편집**하는 것이
 * 기본이다. 승인본만 있으면 학생의 개정본 만들기와 같은 경로(createPlanRevision)로
 * v+1 draft 를 뜬다 — 승인본 자체는 건드리지 않는다.
 */
export async function ensureEditablePlan(
  client: SupabaseClient<Database>,
  input: {
    userId: string;
    cohortId: string;
    periodStart: string;
    periodEnd: string;
    staffId: string;
  },
): Promise<{ planId: string; origin: "inflight" | "revision" | "new" }> {
  const { data: rows, error } = await client
    .from("study_plans")
    .select("plan_id, status, version")
    .eq("user_id", input.userId)
    .eq("period_start", input.periodStart)
    .order("version", { ascending: false });
  if (error) throw error;

  const inflight = (rows ?? []).find((r) =>
    ["draft", "submitted", "revision_requested"].includes(r.status),
  );
  if (inflight) {
    await stampAuthor(client, inflight.plan_id, input.staffId);
    return { planId: inflight.plan_id, origin: "inflight" };
  }

  const approved = (rows ?? []).find((r) => r.status === "approved");
  if (approved) {
    const planId = await createPlanRevision(client, approved.plan_id, input.userId);
    await stampAuthor(client, planId, input.staffId);
    return { planId, origin: "revision" };
  }

  const { data: created, error: cErr } = await client
    .from("study_plans")
    .insert({
      user_id: input.userId,
      cohort_id: input.cohortId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "draft",
      authored_by: input.staffId,
    })
    .select("plan_id")
    .single();
  if (cErr) throw cErr;
  return { planId: created.plan_id, origin: "new" };
}

/** 상담자가 손댄 계획임을 남긴다 — 운영 게이트가 학생 제출과 갈라 세는 근거. */
async function stampAuthor(
  client: SupabaseClient<Database>,
  planId: string,
  staffId: string,
): Promise<void> {
  const { error } = await client
    .from("study_plans")
    .update({ authored_by: staffId, updated_at: new Date().toISOString() })
    .eq("plan_id", planId);
  if (error) throw error;
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

// ── Stage 3 — 일일 기록 (append-only 원장) ───────────────────────────────────

export interface StudyLogRow {
  logId: string;
  logDate: string;
  planItemId: string | null;
  nodeId: string | null;
  lessonId: string | null;
  activityType: PlanActivityType;
  minutes: number;
  source: "plan_check" | "manual" | "timer";
  completion: "full" | "partial" | "none";
  reversesLogId: string | null;
  /** feat-7-048 — INSERT 시점에만 채운다(append-only). 과거 로그는 null. */
  subjectKind: string | null;
  subjectCode: string | null;
  startedAt: string | null;
}

const LOG_SELECT =
  "log_id, log_date, plan_item_id, node_id, lesson_id, activity_type, minutes, source, completion, reverses_log_id, subject_kind, subject_code, started_at";

function rowToLog(r: Record<string, unknown>): StudyLogRow {
  return {
    logId: r.log_id as string,
    logDate: r.log_date as string,
    planItemId: (r.plan_item_id as string | null) ?? null,
    nodeId: (r.node_id as string | null) ?? null,
    lessonId: (r.lesson_id as string | null) ?? null,
    activityType: r.activity_type as PlanActivityType,
    minutes: r.minutes as number,
    source: r.source as "plan_check" | "manual" | "timer",
    completion: r.completion as "full" | "partial" | "none",
    reversesLogId: (r.reverses_log_id as string | null) ?? null,
    subjectKind: (r.subject_kind as string | null) ?? null,
    subjectCode: (r.subject_code as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
  };
}

export async function listLogsForDate(
  client: SupabaseClient<Database>,
  userId: string,
  dateISO: string,
): Promise<StudyLogRow[]> {
  const { data, error } = await client
    .from("study_logs")
    .select(LOG_SELECT)
    .eq("user_id", userId)
    .eq("log_date", dateISO)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => rowToLog(r as Record<string, unknown>));
}

export async function listLogsForRange(
  client: SupabaseClient<Database>,
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<StudyLogRow[]> {
  const { data, error } = await client
    .from("study_logs")
    .select(LOG_SELECT)
    .eq("user_id", userId)
    .gte("log_date", fromISO)
    .lte("log_date", toISO)
    .order("log_date");
  if (error) throw error;
  return (data ?? []).map((r) => rowToLog(r as Record<string, unknown>));
}

// ── Stage 3 — 격주 체크포인트 (checkpoint_date 기준 소급 계산, 승인 2.1) ─────

export interface CheckpointRow {
  checkpointId: string;
  planId: string;
  checkpointDate: string;
  plannedMinutesToDate: number;
  actualMinutesToDate: number;
  itemBreakdown: Array<{
    itemId: string;
    title: string;
    plannedMin: number;
    actualMin: number;
    fullDays: number;
    expectedDays: number;
  }>;
  note: string | null;
  createdAt: string;
}

export async function listCheckpoints(
  client: SupabaseClient<Database>,
  planId: string,
): Promise<CheckpointRow[]> {
  const { data, error } = await client
    .from("study_plan_checkpoints")
    .select(
      "checkpoint_id, plan_id, checkpoint_date, planned_minutes_to_date, actual_minutes_to_date, item_breakdown, note, created_at",
    )
    .eq("plan_id", planId)
    .order("checkpoint_date");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    checkpointId: r.checkpoint_id,
    planId: r.plan_id,
    checkpointDate: r.checkpoint_date,
    plannedMinutesToDate: r.planned_minutes_to_date,
    actualMinutesToDate: r.actual_minutes_to_date,
    itemBreakdown: (r.item_breakdown ?? []) as CheckpointRow["itemBreakdown"],
    note: r.note,
    createdAt: r.created_at,
  }));
}

/** 계획의 격주 체크포인트 날짜 — period_start + 13일, + 27일 (기간 내). */
export function checkpointDatesForPlan(periodStart: string, periodEnd: string): string[] {
  return [addDaysISO(periodStart, 13), addDaysISO(periodStart, 27)].filter(
    (d) => d <= periodEnd,
  );
}

/**
 * 도래한 체크포인트를 지연 생성(멱등 — unique(plan_id, date)).
 * ★집계는 "현재"가 아니라 checkpoint_date 기준 소급 계산(승인 2.1) — 원장이
 * append-only 라 언제 생성해도 동일 값이 재현된다. 기존 행은 재계산하지 않는다.
 * 생성 주체 = 상담자 화면 로드(학생 뷰에 쓰기 부작용 없음).
 */
export async function ensureCheckpoints(
  client: SupabaseClient<Database>,
  plan: StudyPlan,
  items: StudyPlanItem[],
  createdBy: string,
  todayISO: string,
): Promise<void> {
  if (plan.status !== "approved" && plan.status !== "superseded") return;
  const due = checkpointDatesForPlan(plan.periodStart, plan.periodEnd).filter(
    (d) => d <= todayISO,
  );
  if (due.length === 0) return;
  const existing = await listCheckpoints(client, plan.planId);
  const have = new Set(existing.map((c) => c.checkpointDate));
  const missing = due.filter((d) => !have.has(d));
  if (missing.length === 0) return;

  const logs = await listLogsForRange(client, plan.userId, plan.periodStart, plan.periodEnd);
  const titleByItem = new Map(items.map((i) => [i.itemId, i.title]));
  const inputs = items.map((i) => ({
    itemId: i.itemId,
    dayScope: i.dayScope,
    startDate: i.startDate,
    endDate: i.endDate,
    dailyMinutes: i.dailyMinutes,
  }));

  for (const cpDate of missing) {
    // 소급 — cpDate 이하 로그만 (이후 로그가 있어도 그 시점 상태를 재현).
    const metrics = computePlanMetrics(
      inputs,
      logs
        .filter((l) => l.logDate <= cpDate)
        .map((l) => ({
          logId: l.logId,
          planItemId: l.planItemId,
          nodeId: l.nodeId,
          logDate: l.logDate,
          minutes: l.minutes,
          completion: l.completion,
          reversesLogId: l.reversesLogId,
        })),
      plan.periodStart,
      cpDate,
    );
    const { error } = await client.from("study_plan_checkpoints").upsert(
      {
        plan_id: plan.planId,
        checkpoint_date: cpDate,
        planned_minutes_to_date: metrics.totalExpectedMinutes,
        actual_minutes_to_date: metrics.totalActualMinutes,
        item_breakdown: metrics.items.map((m) => ({
          itemId: m.itemId,
          title: titleByItem.get(m.itemId) ?? "",
          plannedMin: m.expectedMinutes,
          actualMin: m.actualMinutes,
          fullDays: m.fullDays,
          expectedDays: m.expectedDays,
        })),
        created_by: createdBy,
      },
      { onConflict: "plan_id,checkpoint_date", ignoreDuplicates: true }, // 스냅샷 불변
    );
    if (error) throw error;
  }
}

// ── Stage 3 — 기간 지표 (준수율 = 현재 승인본 기준, 미제출 월 = null) ────────

export interface PeriodCompliance {
  noPlan: boolean;
  metrics: ReturnType<typeof computePlanMetrics> | null;
  itemTitles: Map<string, string>;
  planVersionCount: number;
}

export async function getPeriodCompliance(
  client: SupabaseClient<Database>,
  userId: string,
  periodStart: string,
  toISO: string,
): Promise<PeriodCompliance> {
  const { data, error } = await client
    .from("study_plans")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw error;
  const versionCount = await countPlanVersions(client, userId, periodStart);
  if (!data) {
    // 미제출/미승인 월 — 준수율 null (평가 제외, no_plan). 자동 승인 없음.
    return { noPlan: true, metrics: null, itemTitles: new Map(), planVersionCount: versionCount };
  }
  const plan = rowToPlan(data as Record<string, unknown>);
  const items = await listPlanItems(client, plan.planId);
  const logs = await listLogsForRange(client, userId, plan.periodStart, toISO);
  const metrics = computePlanMetrics(
    items.map((i) => ({
      itemId: i.itemId,
      dayScope: i.dayScope,
      startDate: i.startDate,
      endDate: i.endDate,
      dailyMinutes: i.dailyMinutes,
    })),
    logs.map((l) => ({
      logId: l.logId,
      planItemId: l.planItemId,
      nodeId: l.nodeId,
      logDate: l.logDate,
      minutes: l.minutes,
      completion: l.completion,
      reversesLogId: l.reversesLogId,
    })),
    plan.periodStart,
    toISO < plan.periodEnd ? toISO : plan.periodEnd,
  );
  return {
    noPlan: false,
    metrics,
    itemTitles: new Map(items.map((i) => [i.itemId, i.title])),
    planVersionCount: versionCount,
  };
}

export { expectedDaysInRange };

// ── Stage 3 — 노드 선택기 빈 상태 폴백 (Stage 2 승인 문서 §1-1 권장안) ───────
// 신규 학생은 약점·최근이 모두 비어 전체 트리로 떨어진다 — student_subject_status
// 의 수준 낮은 법과목 상위 노드를 제안한다.
// ★대상 집합은 구 lecture_stage in ('none','basic') 과 같아야 한다(feat-7-048 D3
//   백필이 그 등가를 지킨다) — 좁히면 신규 학생의 제안이 조용히 사라진다.

export async function listLevelBasedNodeSuggestions(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 8,
): Promise<Array<{ nodeId: string; displayLabel: string; sub: string }>> {
  const status = await listSubjectStatus(client, userId);
  const lowLaw = status
    .filter(
      (s) =>
        s.subjectKind === "law" &&
        (s.basicCourseStatus === "before" || s.basicCourseStatus === "retake") &&
        s.subjectCode !== "civil-procedure", // 체계도 없음
    )
    .map((s) => s.subjectCode as LawSubjectSlug);
  if (lowLaw.length === 0) return [];
  const out: Array<{ nodeId: string; displayLabel: string; sub: string }> = [];
  for (const law of lowLaw) {
    const nodes = await listPlanNodes(client, law);
    const lawName = LAW_SUBJECTS[law]?.name ?? law;
    for (const n of nodes.filter((x) => x.depth === 0).slice(0, 3)) {
      out.push({ nodeId: n.nodeId, displayLabel: n.displayLabel, sub: lawName });
      if (out.length >= limit) return out;
    }
  }
  return out;
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

// ── feat-7-048 Stage C — 과목 축 파생 · 과목 색상 ────────────────────────────

/**
 * 과거 로그(subject 컬럼 NULL)의 과목을 조회 시점에 파생한다.
 * ★원장은 append-only 라 UPDATE 로 메우지 않는다 — 통계는 `저장값 ?? 파생값`.
 * 파생 경로: 로그 node_id → 계획 항목의 subject/node → systematic_nodes.law_code.
 */
export async function attachDerivedSubjects(
  client: SupabaseClient<Database>,
  logs: StudyLogRow[],
): Promise<StudyLogRow[]> {
  const missing = logs.filter((l) => !l.subjectCode);
  const itemIds = [
    ...new Set(missing.map((l) => l.planItemId).filter((v): v is string => !!v)),
  ];
  const itemSubject = new Map<string, { kind: string; code: string }>();
  const itemNode = new Map<string, string>();
  for (let i = 0; i < itemIds.length; i += 150) {
    const { data } = await client
      .from("study_plan_items")
      .select("item_id, node_id, subject_kind, subject_code")
      .in("item_id", itemIds.slice(i, i + 150));
    for (const r of data ?? []) {
      if (r.subject_kind && r.subject_code) {
        itemSubject.set(r.item_id, { kind: r.subject_kind, code: r.subject_code });
      }
      if (r.node_id) itemNode.set(r.item_id, r.node_id);
    }
  }

  const nodeIds = [
    ...new Set([
      ...missing.map((l) => l.nodeId).filter((v): v is string => !!v),
      ...itemNode.values(),
    ]),
  ];
  const nodeLaw = new Map<string, string>();
  for (let i = 0; i < nodeIds.length; i += 150) {
    const { data } = await client
      .from("systematic_nodes")
      .select("node_id, law_code")
      .in("node_id", nodeIds.slice(i, i + 150));
    for (const r of data ?? []) nodeLaw.set(r.node_id, r.law_code);
  }

  return logs.map((l) => {
    if (l.subjectCode) return l;
    const viaItem = l.planItemId ? itemSubject.get(l.planItemId) : undefined;
    const node = l.nodeId ?? (l.planItemId ? itemNode.get(l.planItemId) : undefined);
    const law = node ? nodeLaw.get(node) : undefined;
    return {
      ...l,
      subjectKind: viaItem?.kind ?? (law ? "law" : null),
      subjectCode: viaItem?.code ?? law ?? null,
    };
  });
}

/** 학생별 과목 색 오버라이드 — 없으면 코드의 기본 매핑이 쓰인다. */
export async function listSubjectColors(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await client
    .from("student_subject_colors")
    .select("subject_kind, subject_code, color_key")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    out[`${r.subject_kind}:${r.subject_code}`] = r.color_key;
  }
  return out;
}

export async function upsertSubjectColor(
  client: SupabaseClient<Database>,
  input: {
    userId: string;
    subjectKind: string;
    subjectCode: string;
    colorKey: string;
  },
): Promise<void> {
  const { error } = await client.from("student_subject_colors").upsert(
    {
      user_id: input.userId,
      subject_kind: input.subjectKind,
      subject_code: input.subjectCode,
      color_key: input.colorKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject_kind,subject_code" },
  );
  if (error) throw error;
}

/** 노드 → 과목(법). 노드가 없거나 못 찾으면 null(미분류). */
export async function subjectFromNode(
  client: SupabaseClient<Database>,
  nodeId: string | null,
): Promise<{ kind: "law"; code: string } | null> {
  if (!nodeId) return null;
  const { data } = await client
    .from("systematic_nodes")
    .select("law_code")
    .eq("node_id", nodeId)
    .maybeSingle();
  return data?.law_code ? { kind: "law", code: data.law_code } : null;
}

/**
 * 폼의 "kind:code" 선택값 → 과목. 선택이 없으면 노드에서 파생한다(법과목).
 * 자연과학·기타는 파생할 근거가 없어 선택값이 유일한 출처다.
 */
export async function resolveSubjectInput(
  client: SupabaseClient<Database>,
  raw: string | undefined,
  nodeId: string | null,
): Promise<{ kind: string; code: string } | null> {
  if (raw) {
    const [kind, code] = raw.split(":");
    if (kind && code && isValidSubject(kind, code)) return { kind, code };
  }
  return subjectFromNode(client, nodeId);
}

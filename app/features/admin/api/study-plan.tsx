// Phase 3 — 진단·계획 승인 staff API. staff 역할 + 반 소유권 게이트
// (api/offline-test.tsx 와 동일 원칙 — instructor 는 본인 소유 반만).
// 승인 전이만 RPC(approve_study_plan) — supersede+approve 원자성(승인 2.3).

import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { resolveCohortGate } from "~/features/admin/lib/cohort-gate.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { createUserNotifications } from "~/features/notifications/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  BASIC_COURSE_STATUS_BY_KIND,
  STUDY_DIRECTION_BY_KIND,
  currentMonthPeriod,
} from "~/features/study-plans/labels";
import {
  ensureEditablePlan,
  upsertStudentDiagnostics,
  upsertSubjectStatusManual,
} from "~/features/study-plans/queries.server";

import type { Route } from "./+types/study-plan";

const diagnosticsSchema = z.object({
  userId: z.string().uuid(),
  cohortId: z.string().uuid(),
  attemptType: z.enum(["first", "repeat"]),
  weekdayMinutes: z.coerce.number().int().min(0).max(1440),
  weekendMinutes: z.coerce.number().int().min(0).max(1440),
  entryYear: z.coerce.number().int().min(2000).max(2100).optional(),
  entryMonth: z.coerce.number().int().min(1).max(12).optional(),
  note: z.string().trim().max(2000).optional(),
});

// 과목 종류별 허용 집합은 labels.ts 가 SSOT — DB CHECK 는 합집합이라 여기서 좁힌다.
const subjectStatusSchema = z
  .object({
    userId: z.string().uuid(),
    subjectKind: z.enum(["law", "science"]),
    subjectCode: z.string().min(1).max(40),
    basicCourseStatus: z
      .enum(["before", "done", "retake", "not_needed"])
      .optional(),
    studyDirection: z
      .enum(["advanced", "objective", "reading_problem", "problem"])
      .optional(),
    scienceTier: z.enum(["high", "mid", "low"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.basicCourseStatus &&
      !BASIC_COURSE_STATUS_BY_KIND[v.subjectKind].includes(v.basicCourseStatus)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["basicCourseStatus"],
        message: "이 과목에서 쓸 수 없는 값입니다",
      });
    }
    if (
      v.studyDirection &&
      !STUDY_DIRECTION_BY_KIND[v.subjectKind].includes(v.studyDirection)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studyDirection"],
        message: "이 과목에서 쓸 수 없는 값입니다",
      });
    }
  });

// 상담자가 쓰는 계획 항목 — 학생 폼(api/study-plan.tsx itemSchema)과 같은 규칙.
// 강의 연결(lessonId)은 상담 화면에 없다(노드 직접 선택만).
const planItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  activityType: z.enum([
    "lecture",
    "review",
    "problem",
    "memorize",
    "reading",
    "essay",
    "other",
  ]),
  dailyMinutes: z.coerce.number().int().min(1).max(1440),
  dayScope: z.enum(["weekday", "weekend", "all"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.coerce.number().int().min(1).max(99).optional(),
  nodeId: z.string().uuid().optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  const planId = String(fd.get("planId") ?? "");
  const gate = await resolveCohortGate({
    role,
    userId: user.id,
    formCohortId: String(fd.get("cohortId") ?? ""),
    planId,
  });
  if ("error" in gate) return data({ error: gate.error }, { status: gate.status });
  const cohortId = gate.cohortId;

  if (intent === "save_diagnostics") {
    const parsed = diagnosticsSchema.safeParse({
      userId: fd.get("userId"),
      cohortId,
      attemptType: fd.get("attemptType"),
      weekdayMinutes: fd.get("weekdayMinutes"),
      weekendMinutes: fd.get("weekendMinutes"),
      entryYear: fd.get("entryYear") || undefined,
      entryMonth: fd.get("entryMonth") || undefined,
      note: fd.get("note") || undefined,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요" }, { status: 400 });
    // 대상 학생이 이 반 멤버인지 재검증(fail-closed).
    const { data: member } = await adminClient
      .from("cohort_members")
      .select("profile_id")
      .eq("cohort_id", cohortId)
      .eq("profile_id", parsed.data.userId)
      .maybeSingle();
    if (!member) return data({ error: "이 반 학생이 아닙니다" }, { status: 403 });
    await upsertStudentDiagnostics(client, {
      userId: parsed.data.userId,
      cohortId,
      attemptType: parsed.data.attemptType,
      weekdayMinutes: parsed.data.weekdayMinutes,
      weekendMinutes: parsed.data.weekendMinutes,
      entryYear: parsed.data.entryYear ?? null,
      entryMonth: parsed.data.entryMonth ?? null,
      note: parsed.data.note ?? null,
      updatedBy: user.id,
    });
    return data({ ok: true });
  }

  if (intent === "save_subject_status") {
    const parsed = subjectStatusSchema.safeParse({
      userId: fd.get("userId"),
      subjectKind: fd.get("subjectKind"),
      subjectCode: fd.get("subjectCode"),
      basicCourseStatus: fd.get("basicCourseStatus") || undefined,
      studyDirection: fd.get("studyDirection") || undefined,
      scienceTier: fd.get("scienceTier") || undefined,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요" }, { status: 400 });
    await upsertSubjectStatusManual(client, {
      userId: parsed.data.userId,
      subjectKind: parsed.data.subjectKind,
      subjectCode: parsed.data.subjectCode,
      basicCourseStatus: parsed.data.basicCourseStatus ?? null,
      studyDirection: parsed.data.studyDirection ?? null,
      scienceTier: parsed.data.scienceTier ?? null,
      updatedBy: user.id,
    });
    return data({ ok: true });
  }

  // ── feat-7-048 Stage B — 상담자 계획 직접 편집 ─────────────────────────────
  // 전부 요청 클라이언트(staff RLS) — adminClient 금지. 승인본은 RLS 가 잠근다.

  if (intent === "ensure_editable_plan") {
    const userId = String(fd.get("userId") ?? "");
    if (!z.string().uuid().safeParse(userId).success) {
      return data({ error: "userId 누락" }, { status: 400 });
    }
    const { data: member } = await adminClient
      .from("cohort_members")
      .select("profile_id")
      .eq("cohort_id", cohortId)
      .eq("profile_id", userId)
      .maybeSingle();
    if (!member) return data({ error: "이 반 학생이 아닙니다" }, { status: 403 });
    const { periodStart, periodEnd } = currentMonthPeriod();
    try {
      const res = await ensureEditablePlan(client, {
        userId,
        cohortId,
        periodStart,
        periodEnd,
        staffId: user.id,
      });
      return data({ ok: true, planId: res.planId, origin: res.origin });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "계획을 준비할 수 없습니다";
      return data({ error: msg }, { status: 400 });
    }
  }

  if (intent === "upsert_plan_item" || intent === "delete_plan_item") {
    if (!planId) return data({ error: "planId 누락" }, { status: 400 });
    // 반 소유권은 위 게이트(cohortId 역추적)에서 이미 확인됐다.
    if (intent === "delete_plan_item") {
      const itemId = String(fd.get("itemId") ?? "");
      const { data: removed, error } = await client
        .from("study_plan_items")
        .delete()
        .eq("item_id", itemId)
        .eq("plan_id", planId)
        .select("item_id");
      if (error || !removed?.length) {
        return data({ error: "삭제할 수 없습니다 (승인된 계획은 수정 불가)" }, { status: 400 });
      }
      return data({ ok: true });
    }
    const parsed = planItemSchema.safeParse({
      title: fd.get("title"),
      activityType: fd.get("activityType"),
      dailyMinutes: fd.get("dailyMinutes"),
      dayScope: fd.get("dayScope"),
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate"),
      priority: fd.get("priority") || undefined,
      nodeId: fd.get("nodeId") || undefined,
    });
    if (!parsed.success) {
      return data({ error: "입력을 확인해 주세요 (하루 시간은 필수입니다)" }, { status: 400 });
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return data({ error: "기간이 올바르지 않습니다" }, { status: 400 });
    }
    const row = {
      title: parsed.data.title,
      activity_type: parsed.data.activityType,
      daily_minutes: parsed.data.dailyMinutes,
      day_scope: parsed.data.dayScope,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      priority: parsed.data.priority ?? null,
      node_id: parsed.data.nodeId ?? null,
      updated_by: user.id,
    };
    const itemId = String(fd.get("itemId") ?? "");
    if (itemId) {
      const { data: updated, error } = await client
        .from("study_plan_items")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("item_id", itemId)
        .eq("plan_id", planId)
        .select("item_id");
      if (error || !updated?.length) {
        return data({ error: "수정할 수 없습니다 (승인된 계획은 수정 불가)" }, { status: 400 });
      }
    } else {
      const { error } = await client
        .from("study_plan_items")
        .insert({ plan_id: planId, ...row });
      if (error) {
        return data({ error: "추가할 수 없습니다 (승인된 계획은 수정 불가)" }, { status: 400 });
      }
    }
    return data({ ok: true });
  }

  // 저장하고 승인 — approve_study_plan RPC 는 submitted 만 받는다(RPC 는 손대지 않는다).
  // 그래서 ① 상담자가 대신 제출 → ② 기존 RPC, 두 문장으로 수행한다.
  // ①만 성공해도 계획은 submitted 라는 정상 상태 — 재시도하면 된다.
  if (intent === "save_and_approve") {
    if (!planId) return data({ error: "planId 누락" }, { status: 400 });
    const { count } = await client
      .from("study_plan_items")
      .select("item_id", { head: true, count: "exact" })
      .eq("plan_id", planId);
    if ((count ?? 0) === 0) {
      return data({ error: "항목이 없는 계획은 승인할 수 없습니다" }, { status: 400 });
    }
    const { data: plan } = await client
      .from("study_plans")
      .select("plan_id, user_id, status")
      .eq("plan_id", planId)
      .maybeSingle();
    if (!plan) return data({ error: "계획을 찾을 수 없습니다" }, { status: 404 });
    if (plan.status !== "submitted") {
      const { data: submitted, error: sErr } = await client
        .from("study_plans")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          authored_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("plan_id", planId)
        .in("status", ["draft", "revision_requested"])
        .select("plan_id");
      if (sErr || !submitted?.length) {
        return data({ error: "승인 대상 상태가 아닙니다" }, { status: 400 });
      }
    }
    const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000) || null;
    const { error } = await client.rpc("approve_study_plan", {
      p_plan_id: planId,
      p_comment: comment ?? undefined,
    });
    if (error) {
      return data(
        { error: "제출까지 되었으나 승인에 실패했습니다 — 다시 승인해 주세요" },
        { status: 400 },
      );
    }
    // 학생 통지는 응답 후에도 끝나야 한다 — 서버리스에서 잘리지 않도록 감싼다.
    runAfterResponse(
      createUserNotifications({
        recipientIds: [plan.user_id],
        kind: "study_plan_updated_by_staff",
        entityType: "study_plan",
        entityId: planId,
        title: "이번 달 계획이 상담자에 의해 수정되었습니다",
        body: comment,
        href: "/study/plan",
      }),
    );
    return data({ ok: true });
  }

  if (intent === "approve_plan") {
    const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000) || null;
    // RPC — staff 검증·반 소유권·supersede·approve·baseline·is_locked 를 단일
    // 트랜잭션으로 수행 (approved 파셜 유니크 하 동시 승인 안전).
    const { error } = await client.rpc("approve_study_plan", {
      p_plan_id: planId,
      p_comment: comment ?? undefined,
    });
    if (error) {
      const msg = error.message.includes("not submitted")
        ? "제출 상태의 계획만 승인할 수 있습니다"
        : error.message.includes("owner")
          ? "본인 소유 반만 승인할 수 있습니다"
          : "승인에 실패했습니다";
      return data({ error: msg }, { status: 400 });
    }
    return data({ ok: true });
  }

  if (intent === "reject_plan") {
    const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000);
    if (!comment) {
      return data({ error: "보완 요청 사유를 입력하세요" }, { status: 400 });
    }
    const { data: updated, error } = await client
      .from("study_plans")
      .update({
        status: "revision_requested",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_comment: comment,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", planId)
      .eq("status", "submitted")
      .select("plan_id");
    if (error || !updated?.length) {
      return data({ error: "제출 상태의 계획만 반려할 수 있습니다" }, { status: 400 });
    }
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

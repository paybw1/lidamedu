// Phase 3 — 진단·계획 승인 staff API. staff 역할 + 반 소유권 게이트
// (api/offline-test.tsx 와 동일 원칙 — instructor 는 본인 소유 반만).
// 승인 전이만 RPC(approve_study_plan) — supersede+approve 원자성(승인 2.3).

import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  BASIC_COURSE_STATUS_BY_KIND,
  STUDY_DIRECTION_BY_KIND,
} from "~/features/study-plans/labels";
import {
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

  // 반 소유권 게이트 — cohortId 직접 or plan 역추적.
  let cohortId = String(fd.get("cohortId") ?? "");
  const planId = String(fd.get("planId") ?? "");
  if (!cohortId && planId) {
    const { data: p } = await adminClient
      .from("study_plans")
      .select("cohort_id")
      .eq("plan_id", planId)
      .maybeSingle();
    cohortId = p?.cohort_id ?? "";
  }
  if (!cohortId) return data({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  if (!roleAtLeast(role, "manager")) {
    const cohort = await getCohortById(adminClient, cohortId);
    if (!cohort || cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 접근 가능합니다" }, { status: 403 });
    }
  }

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

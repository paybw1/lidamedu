// 과제 CRUD + 자동 변환 API (feat-7-021). staff 전용 + 반 소유권 게이트(feat-7-021b ①).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  convertWeekToAssignment,
  createAssignment,
  deleteAssignment,
  deleteAssignmentItem,
  updateAssignment,
  upsertAssignmentItem,
  type AssignmentItemKind,
} from "~/features/assignments/queries.server";
import { ASSIGNMENT_ITEM_KINDS } from "~/features/assignments/labels";

import type { Route } from "./+types/assignment";

function emptyToNull(raw: FormDataEntryValue | null, max = 2000): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

const DEADLINE_POLICIES = ["recommended", "late_allowed", "strict"] as const;

const createSchema = z.object({
  cohortId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().min(1),
  deadlinePolicy: z.enum(DEADLINE_POLICIES).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  descriptionMd: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().optional(),
  deadlinePolicy: z.enum(DEADLINE_POLICIES).optional(),
});

const itemSchema = z.object({
  ord: z.coerce.number().int().min(0).max(999),
  kind: z.enum(ASSIGNMENT_ITEM_KINDS as [AssignmentItemKind, ...AssignmentItemKind[]]),
  articleId: z.string().uuid().nullable().optional(),
  caseId: z.string().uuid().nullable().optional(),
  problemId: z.string().uuid().nullable().optional(),
  blankSetId: z.string().uuid().nullable().optional(),
  targetQuantity: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

// ① 소유권 게이트(feat-7-021b) — write intent 가 다루는 대상의 cohort_id 를 확정한다.
// adminClient 읽기(결정적). create/convert_week=폼 cohortId, update/delete/upsert_item
// =assignmentId→cohort, delete_item=itemId→assignment→cohort(RLS 가 아닌 코드로 역추적).
const OWNED_INTENTS = new Set([
  "create",
  "update",
  "delete",
  "upsert_item",
  "delete_item",
  "convert_week",
]);

async function resolveAssignmentCohortId(
  admin: SupabaseClient<Database>,
  intent: string,
  fd: FormData,
): Promise<string | null> {
  if (intent === "create" || intent === "convert_week") {
    return emptyToNull(fd.get("cohortId"), 100);
  }
  if (intent === "update" || intent === "delete" || intent === "upsert_item") {
    const aid = String(fd.get("assignmentId") ?? "");
    if (!aid) return null;
    const { data: a } = await admin
      .from("assignments")
      .select("cohort_id")
      .eq("assignment_id", aid)
      .maybeSingle();
    return a?.cohort_id ?? null;
  }
  if (intent === "delete_item") {
    const iid = String(fd.get("itemId") ?? "");
    if (!iid) return null;
    const { data: item } = await admin
      .from("assignment_items")
      .select("assignment_id")
      .eq("item_id", iid)
      .maybeSingle();
    if (!item) return null;
    const { data: a } = await admin
      .from("assignments")
      .select("cohort_id")
      .eq("assignment_id", item.assignment_id)
      .maybeSingle();
    return a?.cohort_id ?? null;
  }
  return null;
}

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

  // ① 반 소유권 게이트(feat-7-021b) — staff 여부만으론 강사간 수평 권한 상승 가능했음.
  // 강사는 본인 소유 반만(원장/관리자=전체). 6개 write intent 공통 전치. 서버쿼리가
  // adminClient(RLS 우회)라 RLS 백스톱이 없으므로 여기서 반드시 차단((나) RLS 전환은 후속).
  if (OWNED_INTENTS.has(intent)) {
    const cohortId = await resolveAssignmentCohortId(adminClient, intent, fd);
    if (!cohortId) {
      return data({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
    }
    if (!roleAtLeast(role, "manager")) {
      const cohort = await getCohortById(adminClient, cohortId);
      if (!cohort || cohort.ownerId !== user.id) {
        return data({ error: "본인 소유 반만 접근 가능합니다" }, { status: 403 });
      }
    }
  }

  if (intent === "create") {
    const parsed = createSchema.safeParse({
      cohortId: fd.get("cohortId"),
      title: fd.get("title"),
      descriptionMd: emptyToNull(fd.get("descriptionMd")),
      dueAt: fd.get("dueAt"),
      deadlinePolicy: fd.get("deadlinePolicy") ?? undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await createAssignment(client, {
      ...parsed.data,
      createdBy: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, assignmentId: res.assignmentId });
  }

  if (intent === "update") {
    const assignmentId = String(fd.get("assignmentId") ?? "");
    if (!assignmentId) return data({ error: "assignmentId 누락" }, { status: 400 });
    const parsed = updateSchema.safeParse({
      title: fd.get("title") ? String(fd.get("title")) : undefined,
      descriptionMd:
        fd.get("descriptionMd") !== null
          ? emptyToNull(fd.get("descriptionMd"))
          : undefined,
      dueAt: fd.get("dueAt") ? String(fd.get("dueAt")) : undefined,
      deadlinePolicy: fd.get("deadlinePolicy")
        ? String(fd.get("deadlinePolicy"))
        : undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await updateAssignment(client, assignmentId, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const assignmentId = String(fd.get("assignmentId") ?? "");
    if (!assignmentId) return data({ error: "assignmentId 누락" }, { status: 400 });
    const res = await deleteAssignment(client, assignmentId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "upsert_item") {
    const assignmentId = String(fd.get("assignmentId") ?? "");
    const itemId = fd.get("itemId") ? String(fd.get("itemId")) : undefined;
    if (!assignmentId)
      return data({ error: "assignmentId 누락" }, { status: 400 });
    const parsed = itemSchema.safeParse({
      ord: fd.get("ord"),
      kind: fd.get("kind"),
      articleId: emptyToNull(fd.get("articleId"), 100),
      caseId: emptyToNull(fd.get("caseId"), 100),
      problemId: emptyToNull(fd.get("problemId"), 100),
      blankSetId: emptyToNull(fd.get("blankSetId"), 100),
      targetQuantity: fd.get("targetQuantity") || undefined,
      note: emptyToNull(fd.get("note")),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await upsertAssignmentItem(client, {
      itemId,
      assignmentId,
      ...parsed.data,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, itemId: res.itemId });
  }

  if (intent === "delete_item") {
    const itemId = String(fd.get("itemId") ?? "");
    if (!itemId) return data({ error: "itemId 누락" }, { status: 400 });
    const res = await deleteAssignmentItem(client, itemId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // 자동 변환: 커리큘럼 주차 → 과제
  if (intent === "convert_week") {
    const weekId = String(fd.get("weekId") ?? "");
    const cohortId = String(fd.get("cohortId") ?? "");
    const dueAt = String(fd.get("dueAt") ?? "");
    if (!weekId || !cohortId || !dueAt) {
      return data({ error: "weekId/cohortId/dueAt 누락" }, { status: 400 });
    }
    const res = await convertWeekToAssignment(client, {
      weekId,
      cohortId,
      dueAt,
      createdBy: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, assignmentId: res.assignmentId });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

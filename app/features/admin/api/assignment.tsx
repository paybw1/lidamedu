// 과제 CRUD + 자동 변환 API (feat-7-021). staff 전용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
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

const createSchema = z.object({
  cohortId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().min(1),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  descriptionMd: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().optional(),
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

  if (intent === "create") {
    const parsed = createSchema.safeParse({
      cohortId: fd.get("cohortId"),
      title: fd.get("title"),
      descriptionMd: emptyToNull(fd.get("descriptionMd")),
      dueAt: fd.get("dueAt"),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await createAssignment({ ...parsed.data, createdBy: user.id });
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
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await updateAssignment(assignmentId, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const assignmentId = String(fd.get("assignmentId") ?? "");
    if (!assignmentId) return data({ error: "assignmentId 누락" }, { status: 400 });
    const res = await deleteAssignment(assignmentId);
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
    const res = await upsertAssignmentItem({ itemId, assignmentId, ...parsed.data });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, itemId: res.itemId });
  }

  if (intent === "delete_item") {
    const itemId = String(fd.get("itemId") ?? "");
    if (!itemId) return data({ error: "itemId 누락" }, { status: 400 });
    const res = await deleteAssignmentItem(itemId);
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
    const res = await convertWeekToAssignment({
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

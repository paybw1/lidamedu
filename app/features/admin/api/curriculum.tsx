// 커리큘럼 + 주차 + 항목 CRUD + cohort 적용 API (feat-7-020). staff 전용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  applyCurriculumToCohort,
  createCurriculum,
  deleteCurriculum,
  deleteItem,
  deleteWeek,
  removeCurriculumFromCohort,
  updateCurriculum,
  upsertItem,
  upsertWeek,
  type CurriculumItemKind,
} from "~/features/curricula/queries.server";
import { CURRICULUM_ITEM_KINDS } from "~/features/curricula/labels";

import type { Route } from "./+types/curriculum";

function emptyToNull(raw: FormDataEntryValue | null, max = 2000): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  durationWeeks: z.coerce.number().int().min(1).max(52),
  subjectLaws: z.array(z.string().trim().min(1).max(50)).default([]),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  durationWeeks: z.coerce.number().int().min(1).max(52).optional(),
  subjectLaws: z.array(z.string()).optional(),
  isPublished: z.coerce.boolean().optional(),
});

const weekSchema = z.object({
  weekNumber: z.coerce.number().int().min(1).max(52),
  title: z.string().trim().min(1).max(200),
  goalMd: z.string().trim().max(2000).nullable().optional(),
});

const itemSchema = z.object({
  ord: z.coerce.number().int().min(0).max(999),
  kind: z.enum(CURRICULUM_ITEM_KINDS as [CurriculumItemKind, ...CurriculumItemKind[]]),
  articleId: z.string().uuid().nullable().optional(),
  caseId: z.string().uuid().nullable().optional(),
  problemId: z.string().uuid().nullable().optional(),
  blankSetId: z.string().uuid().nullable().optional(),
  lectureTitle: z.string().trim().max(200).nullable().optional(),
  lectureUrl: z.string().trim().url().max(1000).nullable().optional(),
  lectureDurationMin: z.coerce.number().int().min(0).max(999).nullable().optional(),
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

  // ─── 커리큘럼 본체 ───
  if (intent === "create") {
    const parsed = createSchema.safeParse({
      name: fd.get("name"),
      description: emptyToNull(fd.get("description")),
      durationWeeks: fd.get("durationWeeks"),
      subjectLaws: fd.getAll("subjectLaws").map((v) => String(v)),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await createCurriculum({ ...parsed.data, ownerId: user.id });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, curriculumId: res.curriculumId });
  }

  if (intent === "update") {
    const curriculumId = String(fd.get("curriculumId") ?? "");
    if (!curriculumId) return data({ error: "curriculumId 누락" }, { status: 400 });
    const parsed = updateSchema.safeParse({
      name: fd.get("name") ? String(fd.get("name")) : undefined,
      description:
        fd.get("description") !== null
          ? emptyToNull(fd.get("description"))
          : undefined,
      durationWeeks: fd.get("durationWeeks") ? fd.get("durationWeeks") : undefined,
      subjectLaws: fd.has("subjectLaws")
        ? fd.getAll("subjectLaws").map((v) => String(v))
        : undefined,
      isPublished: fd.has("isPublished")
        ? String(fd.get("isPublished")) === "1"
        : undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await updateCurriculum(curriculumId, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const curriculumId = String(fd.get("curriculumId") ?? "");
    if (!curriculumId) return data({ error: "curriculumId 누락" }, { status: 400 });
    const res = await deleteCurriculum(curriculumId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // ─── 주차 ───
  if (intent === "upsert_week") {
    const curriculumId = String(fd.get("curriculumId") ?? "");
    const weekId = fd.get("weekId") ? String(fd.get("weekId")) : undefined;
    if (!curriculumId) return data({ error: "curriculumId 누락" }, { status: 400 });
    const parsed = weekSchema.safeParse({
      weekNumber: fd.get("weekNumber"),
      title: fd.get("title"),
      goalMd: emptyToNull(fd.get("goalMd")),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await upsertWeek({ weekId, curriculumId, ...parsed.data });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, weekId: res.weekId });
  }

  if (intent === "delete_week") {
    const weekId = String(fd.get("weekId") ?? "");
    if (!weekId) return data({ error: "weekId 누락" }, { status: 400 });
    const res = await deleteWeek(weekId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // ─── 항목 ───
  if (intent === "upsert_item") {
    const weekId = String(fd.get("weekId") ?? "");
    const itemId = fd.get("itemId") ? String(fd.get("itemId")) : undefined;
    if (!weekId) return data({ error: "weekId 누락" }, { status: 400 });
    const parsed = itemSchema.safeParse({
      ord: fd.get("ord"),
      kind: fd.get("kind"),
      articleId: emptyToNull(fd.get("articleId"), 100),
      caseId: emptyToNull(fd.get("caseId"), 100),
      problemId: emptyToNull(fd.get("problemId"), 100),
      blankSetId: emptyToNull(fd.get("blankSetId"), 100),
      lectureTitle: emptyToNull(fd.get("lectureTitle"), 200),
      lectureUrl: emptyToNull(fd.get("lectureUrl"), 1000),
      lectureDurationMin: fd.get("lectureDurationMin") || undefined,
      targetQuantity: fd.get("targetQuantity") || undefined,
      note: emptyToNull(fd.get("note")),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await upsertItem({ itemId, weekId, ...parsed.data });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, itemId: res.itemId });
  }

  if (intent === "delete_item") {
    const itemId = String(fd.get("itemId") ?? "");
    if (!itemId) return data({ error: "itemId 누락" }, { status: 400 });
    const res = await deleteItem(itemId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // ─── cohort 적용 ───
  if (intent === "apply_to_cohort") {
    const cohortId = String(fd.get("cohortId") ?? "");
    const curriculumId = String(fd.get("curriculumId") ?? "");
    const startDate = String(fd.get("startDate") ?? "");
    if (!cohortId || !curriculumId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return data({ error: "cohortId/curriculumId/startDate 누락 또는 형식 오류" }, { status: 400 });
    }
    const res = await applyCurriculumToCohort(
      cohortId,
      curriculumId,
      startDate,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_from_cohort") {
    const cohortId = String(fd.get("cohortId") ?? "");
    const curriculumId = String(fd.get("curriculumId") ?? "");
    if (!cohortId || !curriculumId) {
      return data({ error: "cohortId/curriculumId 누락" }, { status: 400 });
    }
    const res = await removeCurriculumFromCohort(cohortId, curriculumId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

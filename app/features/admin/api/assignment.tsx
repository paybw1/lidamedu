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
  addAssignmentProblemItems,
  convertWeekToAssignment,
  createAssignment,
  deleteAssignment,
  deleteAssignmentItem,
  updateAssignment,
  upsertAssignmentItem,
  type AssignmentItemKind,
} from "~/features/assignments/queries.server";
import { ASSIGNMENT_ITEM_KINDS } from "~/features/assignments/labels";
import { generateWeakAssignmentsForCohort } from "~/features/assignments/weak-personal.server";
import {
  selectCohortWeakProblems,
  selectProblemsForWeakNodes,
} from "~/features/admin/queries/cohort-weakness.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

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
  "add_weak_items",
  "create_from_weak",
  "generate_weak_personal",
  "toggle_weak_auto",
]);

async function resolveAssignmentCohortId(
  admin: SupabaseClient<Database>,
  intent: string,
  fd: FormData,
): Promise<string | null> {
  if (
    intent === "create" ||
    intent === "convert_week" ||
    intent === "create_from_weak" ||
    intent === "generate_weak_personal" ||
    intent === "toggle_weak_auto"
  ) {
    return emptyToNull(fd.get("cohortId"), 100);
  }
  if (
    intent === "update" ||
    intent === "delete" ||
    intent === "upsert_item" ||
    intent === "add_weak_items"
  ) {
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

  // ── feat-7-040 후속: 약점 → 과제 (모의 picker seam 재사용) ──
  // add_weak_items: 기존 과제에 약점 문제 일괄 추가. create_from_weak: 신규 과제 생성+추가.
  // 약점원: nodeIds(개별 약점, CSV) 우선, 없으면 lawCode(반 공통 약점). 0건이면 생성/추가 안 함.
  if (intent === "add_weak_items" || intent === "create_from_weak") {
    const n = Math.max(1, Math.min(50, Number(fd.get("n")) || 10));
    const nodeIdsRaw = emptyToNull(fd.get("nodeIds"), 2000);
    const lawParse = lawSubjectSlugSchema.safeParse(fd.get("lawCode"));

    // 대상 cohort + (add 면) 기존 문제 제외 집합.
    let cohortId: string;
    let assignmentId: string | null = null;
    const exclude = new Set<string>();
    if (intent === "add_weak_items") {
      assignmentId = String(fd.get("assignmentId") ?? "");
      if (!assignmentId)
        return data({ error: "assignmentId 누락" }, { status: 400 });
      const { data: a } = await adminClient
        .from("assignments")
        .select("cohort_id")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (!a) return data({ error: "과제를 찾을 수 없습니다" }, { status: 404 });
      cohortId = a.cohort_id;
      const { data: items } = await adminClient
        .from("assignment_items")
        .select("problem_id")
        .eq("assignment_id", assignmentId)
        .eq("kind", "problem");
      for (const it of items ?? [])
        if (it.problem_id) exclude.add(it.problem_id);
    } else {
      cohortId = String(fd.get("cohortId") ?? "");
      if (!cohortId) return data({ error: "cohortId 누락" }, { status: 400 });
    }

    // 약점 문제 선택(공용 seam). adminClient — 위 owner 게이트가 선행 차단.
    let problemIds: string[];
    if (nodeIdsRaw) {
      const nodeIds = nodeIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const sel = await selectProblemsForWeakNodes(
        adminClient,
        nodeIds.map((id) => ({
          nodeId: id,
          weaknessScore: 1,
          displayLabel: "",
        })),
        { totalN: n, excludeIds: exclude },
      );
      problemIds = sel.problemIds;
    } else if (lawParse.success) {
      const sel = await selectCohortWeakProblems(
        adminClient,
        cohortId,
        lawParse.data,
        { totalN: n, excludeIds: exclude },
      );
      problemIds = sel.problemIds;
    } else {
      return data(
        { error: "과목(lawCode) 또는 단원(nodeIds)이 필요합니다" },
        { status: 400 },
      );
    }
    if (problemIds.length === 0) {
      return data(
        { error: "약점 문제를 찾지 못했습니다 (표본·승인 문제 부족)" },
        { status: 400 },
      );
    }

    if (intent === "create_from_weak") {
      const title = (emptyToNull(fd.get("title"), 200) ?? "약점 보충 과제").slice(
        0,
        200,
      );
      const dueAt = String(fd.get("dueAt") ?? "");
      if (!dueAt) return data({ error: "마감일(dueAt) 누락" }, { status: 400 });
      const created = await createAssignment(client, {
        cohortId,
        title,
        dueAt,
        createdBy: user.id,
      });
      if (!created.ok) return data({ error: created.error }, { status: 400 });
      const add = await addAssignmentProblemItems(
        client,
        created.assignmentId,
        problemIds,
      );
      if (!add.ok) return data({ error: add.error }, { status: 400 });
      return data({
        ok: true,
        assignmentId: created.assignmentId,
        cohortId,
        added: add.added,
      });
    }

    // add_weak_items — assignmentId 는 위에서 확정.
    if (!assignmentId)
      return data({ error: "assignmentId 누락" }, { status: 400 });
    const add = await addAssignmentProblemItems(
      client,
      assignmentId,
      problemIds,
    );
    if (!add.ok) return data({ error: add.error }, { status: 400 });
    return data({ ok: true, added: add.added });
  }

  // ── feat-7-045: 약점 개인 보충 과제 ──
  if (intent === "generate_weak_personal") {
    const cohortId = String(fd.get("cohortId") ?? "");
    if (!cohortId) return data({ error: "cohortId 누락" }, { status: 400 });
    const n = Math.max(1, Math.min(30, Number(fd.get("n")) || 10));
    const dueDays = Math.max(1, Math.min(30, Number(fd.get("dueDays")) || 7));
    const summary = await generateWeakAssignmentsForCohort(cohortId, {
      n,
      dueDays,
      createdBy: user.id,
    });
    return data({ ok: true, ...summary });
  }

  if (intent === "toggle_weak_auto") {
    const cohortId = String(fd.get("cohortId") ?? "");
    if (!cohortId) return data({ error: "cohortId 누락" }, { status: 400 });
    const enabled = String(fd.get("enabled")) === "1";
    const { error } = await client
      .from("cohorts")
      .update({ weak_assignment_auto: enabled })
      .eq("cohort_id", cohortId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true, enabled });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

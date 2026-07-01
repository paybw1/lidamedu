// 반/기수 CRUD + 멤버 관리 API. instructor 는 본인 소유 반만, admin 은 전부.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  addCohortMember,
  createCohort,
  deleteCohort,
  getCohortById,
  removeCohortMember,
  updateCohort,
} from "~/features/cohorts/queries.server";

import type { Route } from "./+types/cohort";

function emptyToNull(raw: FormDataEntryValue | null, max = 500): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

const upsertSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  startsOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
  endsOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
  // feat-8-027 — 종합반 종류별 열람 범위. 미지정 시 full.
  accessScope: z.enum(["full", "self_study"]).optional(),
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
    const parsed = upsertSchema.safeParse({
      name: fd.get("name"),
      description: emptyToNull(fd.get("description"), 2000),
      startsOn: emptyToNull(fd.get("startsOn"), 10),
      endsOn: emptyToNull(fd.get("endsOn"), 10),
      accessScope: fd.get("accessScope") ?? undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    // manager 이상이면 ownerId 선택 가능, instructor 는 본인.
    let ownerId = user.id;
    if (roleAtLeast(role, "manager")) {
      const requestedOwner = String(fd.get("ownerId") ?? "");
      if (z.string().uuid().safeParse(requestedOwner).success) {
        ownerId = requestedOwner;
      }
    }
    const res = await createCohort(client, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ownerId,
      startsOn: parsed.data.startsOn ?? null,
      endsOn: parsed.data.endsOn ?? null,
      isArchived: false,
      accessScope: parsed.data.accessScope ?? "full",
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, cohortId: res.cohortId });
  }

  if (intent === "update") {
    const cohortId = String(fd.get("cohortId") ?? "");
    if (!z.string().uuid().safeParse(cohortId).success) {
      return data({ error: "Invalid cohortId" }, { status: 400 });
    }
    // 권한 확인 — RLS 가 막아주지만 명시적으로 한 번 더.
    const cohort = await getCohortById(client, cohortId);
    if (!cohort) return data({ error: "Cohort not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 수정 가능" }, { status: 403 });
    }
    const parsed = upsertSchema.safeParse({
      name: fd.get("name"),
      description: emptyToNull(fd.get("description"), 2000),
      startsOn: emptyToNull(fd.get("startsOn"), 10),
      endsOn: emptyToNull(fd.get("endsOn"), 10),
      accessScope: fd.get("accessScope") ?? undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const isArchived = fd.get("isArchived") === "1";
    const res = await updateCohort(client, cohortId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startsOn: parsed.data.startsOn ?? null,
      endsOn: parsed.data.endsOn ?? null,
      isArchived,
      accessScope: parsed.data.accessScope,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const cohortId = String(fd.get("cohortId") ?? "");
    if (!z.string().uuid().safeParse(cohortId).success) {
      return data({ error: "Invalid cohortId" }, { status: 400 });
    }
    const cohort = await getCohortById(client, cohortId);
    if (!cohort) return data({ error: "Cohort not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 삭제 가능" }, { status: 403 });
    }
    const res = await deleteCohort(client, cohortId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "add_member") {
    const cohortId = String(fd.get("cohortId") ?? "");
    const profileId = String(fd.get("profileId") ?? "");
    if (
      !z.string().uuid().safeParse(cohortId).success ||
      !z.string().uuid().safeParse(profileId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const cohort = await getCohortById(client, cohortId);
    if (!cohort) return data({ error: "Cohort not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 멤버 추가" }, { status: 403 });
    }
    const res = await addCohortMember(client, cohortId, profileId, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_member") {
    const cohortId = String(fd.get("cohortId") ?? "");
    const profileId = String(fd.get("profileId") ?? "");
    if (
      !z.string().uuid().safeParse(cohortId).success ||
      !z.string().uuid().safeParse(profileId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const cohort = await getCohortById(client, cohortId);
    if (!cohort) return data({ error: "Cohort not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 멤버 제거" }, { status: 403 });
    }
    const res = await removeCohortMember(client, cohortId, profileId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

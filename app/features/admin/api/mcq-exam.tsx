// 통합 모의고사(mcq_exams) CRUD + 교시 매핑 API. staff 전용. feat-10-005.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  addExamPaper,
  createExam,
  deleteExam,
  removeExamPaper,
  updateExam,
  updateExamPaper,
} from "~/features/mcq-exams/queries.server";
import { isMockKind } from "~/features/mcq-packs/labels";
import { getPackById } from "~/features/mcq-packs/queries.server";

import type { Route } from "./+types/mcq-exam";

function emptyToNull(
  raw: FormDataEntryValue | null,
  max = 1000,
): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

function nullableInt(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

const upsertSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).nullable().optional(),
  passAverage: z.number().int().min(0).max(100),
  publishedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
});

function parseUpsert(fd: FormData) {
  const parsed = upsertSchema.safeParse({
    title: fd.get("title"),
    description: emptyToNull(fd.get("description"), 5000),
    passAverage: nullableInt(fd.get("passAverage")) ?? 60,
    publishedAt: emptyToNull(fd.get("publishedAt"), 10),
  });
  if (!parsed.success) return parsed;
  return {
    success: true as const,
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      year: nullableInt(fd.get("year")),
      examRoundNo: nullableInt(fd.get("examRoundNo")),
      passAverage: parsed.data.passAverage,
      isPublished: fd.get("isPublished") === "1",
      publishedAt: parsed.data.publishedAt ?? null,
    },
  };
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

  if (intent === "create") {
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await createExam(client, parsed.data, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_exam.create",
      entityType: "mcq_exam",
      entityId: res.examId,
      metadata: { title: parsed.data.title },
    });
    return data({ ok: true, examId: res.examId });
  }

  if (intent === "update") {
    const examId = String(fd.get("examId") ?? "");
    if (!z.string().uuid().safeParse(examId).success) {
      return data({ error: "Invalid examId" }, { status: 400 });
    }
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updateExam(client, examId, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_exam.update",
      entityType: "mcq_exam",
      entityId: examId,
      metadata: { title: parsed.data.title },
    });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const examId = String(fd.get("examId") ?? "");
    if (!z.string().uuid().safeParse(examId).success) {
      return data({ error: "Invalid examId" }, { status: 400 });
    }
    const res = await deleteExam(client, examId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_exam.delete",
      entityType: "mcq_exam",
      entityId: examId,
    });
    // 편집 화면에서 삭제 시 그 화면이 사라지므로 목록으로 redirect — 목록
    // 화면의 삭제도 같은 곳으로 돌아와 자동 갱신된다.
    return redirect("/admin/mcq-exams");
  }

  if (intent === "add_paper") {
    const examId = String(fd.get("examId") ?? "");
    const packId = String(fd.get("packId") ?? "");
    if (
      !z.string().uuid().safeParse(examId).success ||
      !z.string().uuid().safeParse(packId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const failFloor = nullableInt(fd.get("failFloor")) ?? 40;
    if (failFloor < 0 || failFloor > 100) {
      return data(
        { error: "과락선은 0–100 사이여야 합니다." },
        { status: 400 },
      );
    }
    // 교시 팩은 학생이 응시할 수 있어야 하므로 공개된 모의 종류 팩만 허용.
    const pack = await getPackById(client, packId);
    if (!pack) {
      return data({ error: "문제집을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!isMockKind(pack.kind)) {
      return data(
        { error: "교시는 모의고사 종류 문제집만 추가할 수 있습니다." },
        { status: 400 },
      );
    }
    if (!pack.isPublished) {
      return data(
        { error: "비공개 문제집은 교시로 쓸 수 없습니다 — 먼저 문제집을 공개하세요." },
        { status: 400 },
      );
    }
    const res = await addExamPaper(client, examId, packId, failFloor);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_paper") {
    const examId = String(fd.get("examId") ?? "");
    const packId = String(fd.get("packId") ?? "");
    if (
      !z.string().uuid().safeParse(examId).success ||
      !z.string().uuid().safeParse(packId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const res = await removeExamPaper(client, examId, packId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "update_paper") {
    const examId = String(fd.get("examId") ?? "");
    const packId = String(fd.get("packId") ?? "");
    if (
      !z.string().uuid().safeParse(examId).success ||
      !z.string().uuid().safeParse(packId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const ord = nullableInt(fd.get("ord"));
    const failFloor = nullableInt(fd.get("failFloor"));
    if (failFloor !== null && (failFloor < 0 || failFloor > 100)) {
      return data(
        { error: "과락선은 0–100 사이여야 합니다." },
        { status: 400 },
      );
    }
    const res = await updateExamPaper(client, examId, packId, {
      ord: ord ?? undefined,
      failFloor: failFloor ?? undefined,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

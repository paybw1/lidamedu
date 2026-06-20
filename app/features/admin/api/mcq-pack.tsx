// MCQ 팩 CRUD + 문제 매핑 API. staff 전용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  addPackProblem,
  addPackProblems,
  createPack,
  deletePack,
  regeneratePastExamPacks,
  releasePackProblems,
  removePackProblem,
  updatePack,
} from "~/features/mcq-packs/queries.server";
import type {
  McqPackKind,
  McqPackSubjectScope,
} from "~/features/mcq-packs/labels";

import type { Route } from "./+types/mcq-pack";

const KINDS = ["past_exam", "mock_full", "mock_progressive", "other"] as const;
const SCOPES = [
  "patent",
  "trademark",
  "design",
  "industrial",
  "civil",
  "civil_procedure",
  "science",
] as const;

function emptyToNull(raw: FormDataEntryValue | null, max = 1000): string | null {
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
  kind: z.enum(KINDS),
  subjectScope: z.enum(SCOPES),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).nullable().optional(),
  publishedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
  videoUrl: z.string().trim().url().max(2000).nullable().optional(),
  resultDocUrl: z.string().trim().url().max(2000).nullable().optional(),
});

function parseUpsert(fd: FormData) {
  const parsed = upsertSchema.safeParse({
    kind: fd.get("kind"),
    subjectScope: fd.get("subjectScope"),
    title: fd.get("title"),
    description: emptyToNull(fd.get("description"), 5000),
    publishedAt: emptyToNull(fd.get("publishedAt"), 10),
    videoUrl: emptyToNull(fd.get("videoUrl"), 2000),
    resultDocUrl: emptyToNull(fd.get("resultDocUrl"), 2000),
  });
  if (!parsed.success) return parsed;
  return {
    success: true as const,
    data: {
      kind: parsed.data.kind as McqPackKind,
      subjectScope: parsed.data.subjectScope as McqPackSubjectScope,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      year: nullableInt(fd.get("year")),
      examRoundNo: nullableInt(fd.get("examRoundNo")),
      durationMin: nullableInt(fd.get("durationMin")),
      videoUrl: parsed.data.videoUrl ?? null,
      resultDocUrl: parsed.data.resultDocUrl ?? null,
      publishedAt: parsed.data.publishedAt ?? null,
      isPublished: fd.get("isPublished") !== "0",
      passScore: nullableInt(fd.get("passScore")),
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
    const res = await createPack(client, parsed.data, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_pack.create",
      entityType: "mcq_pack",
      entityId: res.packId,
      metadata: { title: parsed.data.title, kind: parsed.data.kind },
    });
    return data({ ok: true, packId: res.packId });
  }

  if (intent === "update") {
    const packId = String(fd.get("packId") ?? "");
    if (!z.string().uuid().safeParse(packId).success) {
      return data({ error: "Invalid packId" }, { status: 400 });
    }
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updatePack(client, packId, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_pack.update",
      entityType: "mcq_pack",
      entityId: packId,
      metadata: { title: parsed.data.title },
    });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const packId = String(fd.get("packId") ?? "");
    if (!z.string().uuid().safeParse(packId).success) {
      return data({ error: "Invalid packId" }, { status: 400 });
    }
    const res = await deletePack(client, packId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_pack.delete",
      entityType: "mcq_pack",
      entityId: packId,
    });
    return data({ ok: true });
  }

  if (intent === "add_problem") {
    const packId = String(fd.get("packId") ?? "");
    const problemId = String(fd.get("problemId") ?? "");
    if (
      !z.string().uuid().safeParse(packId).success ||
      !z.string().uuid().safeParse(problemId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const res = await addPackProblem(client, packId, problemId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "regen_past_exam") {
    let result;
    try {
      result = await regeneratePastExamPacks(client, user.id);
    } catch (e) {
      // 무음 500 대신 사유를 UI(err)로 노출.
      return data(
        { error: e instanceof Error ? e.message : "기출 자동 재생성 실패" },
        { status: 500 },
      );
    }
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_pack.regen_past_exam",
      entityType: "mcq_pack",
      entityId: "*",
      metadata: {
        packsUpserted: result.packsUpserted,
        problemsTotal: result.problemsTotal,
      },
    });
    return data({ ok: true, ...result });
  }

  if (intent === "remove_problem") {
    const packId = String(fd.get("packId") ?? "");
    const problemId = String(fd.get("problemId") ?? "");
    if (
      !z.string().uuid().safeParse(packId).success ||
      !z.string().uuid().safeParse(problemId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const res = await removePackProblem(client, packId, problemId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "add_problems") {
    const packId = String(fd.get("packId") ?? "");
    if (!z.string().uuid().safeParse(packId).success) {
      return data({ error: "Invalid packId" }, { status: 400 });
    }
    let problemIds: string[];
    try {
      const raw: unknown = JSON.parse(String(fd.get("problemIds") ?? "[]"));
      const parsed = z.array(z.string().uuid()).max(200).safeParse(raw);
      if (!parsed.success) {
        return data({ error: "Invalid problemIds" }, { status: 400 });
      }
      problemIds = parsed.data;
    } catch {
      return data({ error: "Invalid problemIds" }, { status: 400 });
    }
    const res = await addPackProblems(client, packId, problemIds);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, added: res.added, skipped: res.skipped });
  }

  if (intent === "release_to_subjects") {
    const packId = String(fd.get("packId") ?? "");
    if (!z.string().uuid().safeParse(packId).success) {
      return data({ error: "Invalid packId" }, { status: 400 });
    }
    const res = await releasePackProblems(client, packId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "mcq_pack.release_to_subjects",
      entityType: "mcq_pack",
      entityId: packId,
      metadata: { released: res.released },
    });
    return data({ ok: true, released: res.released });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

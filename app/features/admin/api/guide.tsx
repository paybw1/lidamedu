// 이용 가이드 CRUD API — manager+ 전용.

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  createGuide,
  deleteGuide,
  updateGuide,
} from "~/features/guide/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/guide";

// 유튜브 영상 ID 추출 — watch?v= / youtu.be/ / shorts/ / embed/ 수용.
function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

const schema = z.object({
  intent: z.enum(["create", "update"]),
  guideId: z.string().uuid().nullable(),
  title: z.string().min(1).max(120),
  category: z.string().min(1).max(30),
  bodyMd: z.string().max(20000),
  youtubeUrl: z
    .string()
    .url()
    .refine((u) => extractYoutubeId(u) !== null, {
      message: "유튜브 영상 URL 이 아닙니다 (youtube.com/watch 또는 youtu.be)",
    })
    .nullable(),
  screenKey: z.string().max(60).nullable(),
  isPublished: z.boolean(),
  displayOrder: z.coerce.number().int().min(0).max(999),
  // student=전체 학생 / staff=운영자·강사 전용(종합반 운영 가이드 등).
  audience: z.enum(["student", "staff"]).default("student"),
});

function toNullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
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
  if (!role || !roleAtLeast(role, "manager")) {
    return data({ error: "Forbidden — manager only" }, { status: 403 });
  }

  const fd = await request.formData();

  if (String(fd.get("intent") ?? "") === "delete") {
    const guideId = String(fd.get("guideId") ?? "");
    if (!z.string().uuid().safeParse(guideId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const del = await deleteGuide(guideId);
    if (!del.ok) return data({ error: del.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "guide.delete",
      entityType: "guide_article",
      entityId: guideId,
    });
    return data({ ok: true });
  }

  const parsed = schema.safeParse({
    intent: fd.get("intent"),
    guideId: toNullable(fd.get("guideId")),
    title: fd.get("title"),
    category: String(fd.get("category") ?? "").trim(),
    bodyMd: String(fd.get("bodyMd") ?? ""),
    youtubeUrl: toNullable(fd.get("youtubeUrl")),
    screenKey: toNullable(fd.get("screenKey")),
    isPublished: fd.get("isPublished") === "1",
    displayOrder: fd.get("displayOrder") ?? 0,
    audience: fd.get("audience") === "staff" ? "staff" : "student",
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }

  const input = {
    title: parsed.data.title,
    category: parsed.data.category,
    bodyMd: parsed.data.bodyMd,
    youtubeUrl: parsed.data.youtubeUrl,
    screenKey: parsed.data.screenKey,
    isPublished: parsed.data.isPublished,
    displayOrder: parsed.data.displayOrder,
    audience: parsed.data.audience,
  };

  if (parsed.data.intent === "create") {
    const res = await createGuide(input, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "guide.create",
      entityType: "guide_article",
      entityId: res.guideId,
      metadata: { title: input.title },
    });
    return data({ ok: true });
  }

  if (!parsed.data.guideId) {
    return data({ error: "guideId 누락" }, { status: 400 });
  }
  const res = await updateGuide(parsed.data.guideId, input);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  void logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "guide.update",
    entityType: "guide_article",
    entityId: parsed.data.guideId,
    metadata: { title: input.title },
  });
  return data({ ok: true });
}

// 공지사항 CRUD API (feat-7-011). staff(instructor/admin) 전용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { notifyAnnouncementPublished } from "~/features/announcements/notify.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  searchAudienceUsers,
  updateAnnouncement,
} from "~/features/announcements/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/announcement";

const audienceKindSchema = z.enum(["all", "cohort", "user", "staff"]);

// 노출 플랫폼 — 학습 / 강의 / 둘 다. 미지정(레거시 폼)이면 학습.
const platformScopeSchema = z.enum(["study", "lecture", "both"]).default("study");

const audienceItemSchema = z.object({
  audienceType: z.enum(["cohort", "user"]),
  audienceId: z.string().uuid(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bodyMd: z.string().max(20_000).default(""),
  bodyHtml: z.string().max(200_000).default(""),
  audienceKind: audienceKindSchema,
  platformScope: platformScopeSchema,
  audiences: z.array(audienceItemSchema).max(500),
  isPinned: z.boolean().default(false),
  publish: z.boolean().default(false),
});

function parseAudienceArray(raw: FormDataEntryValue | null) {
  if (!raw) return [];
  const text = String(raw);
  if (!text.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
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

  if (intent === "search_users") {
    const q = String(fd.get("q") ?? "");
    const results = await searchAudienceUsers(q);
    return data({ ok: true, results });
  }

  if (intent === "create") {
    const parsed = createSchema.safeParse({
      title: fd.get("title"),
      bodyMd: fd.get("bodyMd") ?? "",
      bodyHtml: fd.get("bodyHtml") ?? "",
      audienceKind: fd.get("audienceKind"),
      platformScope: fd.get("platformScope") ?? undefined,
      audiences: parseAudienceArray(fd.get("audiences")),
      isPinned: fd.get("isPinned") === "1",
      publish: fd.get("publish") === "1",
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await createAnnouncement(client, {
      title: parsed.data.title,
      bodyHtml: parsed.data.bodyHtml,
      authorId: user.id,
      audienceKind: parsed.data.audienceKind,
      platformScope: parsed.data.platformScope,
      audiences: parsed.data.audiences,
      isPinned: parsed.data.isPinned,
      publish: parsed.data.publish,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    // 발행과 동시에 대상자 인박스로. 응답 후 실행 — 서버리스는 응답 반환 뒤 종료된다.
    if (parsed.data.publish) {
      runAfterResponse(notifyAnnouncementPublished(res.announcementId));
    }
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "announcement.create",
      entityType: "announcement",
      entityId: res.announcementId,
      metadata: {
        title: parsed.data.title,
        publish: parsed.data.publish,
        audienceKind: parsed.data.audienceKind,
      },
    });
    return data({ ok: true, announcementId: res.announcementId });
  }

  if (intent === "update") {
    const announcementId = String(fd.get("announcementId") ?? "");
    if (!z.string().uuid().safeParse(announcementId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const ann = await getAnnouncementById(client, announcementId);
    if (!ann) return data({ error: "Not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && ann.authorId !== user.id) {
      return data({ error: "본인 작성분만 수정 가능" }, { status: 403 });
    }
    const parsed = createSchema.safeParse({
      title: fd.get("title"),
      bodyMd: fd.get("bodyMd") ?? "",
      bodyHtml: fd.get("bodyHtml") ?? "",
      audienceKind: fd.get("audienceKind"),
      platformScope: fd.get("platformScope") ?? undefined,
      audiences: parseAudienceArray(fd.get("audiences")),
      isPinned: fd.get("isPinned") === "1",
      publish: fd.get("publish") === "1",
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updateAnnouncement(client, announcementId, {
      title: parsed.data.title,
      bodyHtml: parsed.data.bodyHtml,
      audienceKind: parsed.data.audienceKind,
      platformScope: parsed.data.platformScope,
      audiences: parsed.data.audiences,
      isPinned: parsed.data.isPinned,
      publish: parsed.data.publish,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    // 초안 → 발행 전환에서만 보낸다. (notify 쪽도 멱등이라 이중 방어)
    if (parsed.data.publish && ann.publishedAt === null) {
      runAfterResponse(notifyAnnouncementPublished(announcementId));
    }
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "announcement.update",
      entityType: "announcement",
      entityId: announcementId,
      metadata: { title: parsed.data.title, publish: parsed.data.publish },
    });
    return data({ ok: true });
  }

  if (intent === "publish" || intent === "unpublish") {
    const announcementId = String(fd.get("announcementId") ?? "");
    if (!z.string().uuid().safeParse(announcementId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const ann = await getAnnouncementById(client, announcementId);
    if (!ann) return data({ error: "Not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && ann.authorId !== user.id) {
      return data({ error: "본인 작성분만 변경 가능" }, { status: 403 });
    }
    const res = await updateAnnouncement(client, announcementId, {
      publish: intent === "publish",
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    // 초안 → 발행 전환에서만. 언발행 후 재발행해도 notify 가 멱등이라 두 번 가지 않는다.
    if (intent === "publish" && ann.publishedAt === null) {
      runAfterResponse(notifyAnnouncementPublished(announcementId));
    }
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: `announcement.${intent}`,
      entityType: "announcement",
      entityId: announcementId,
      metadata: { title: ann.title },
    });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const announcementId = String(fd.get("announcementId") ?? "");
    if (!z.string().uuid().safeParse(announcementId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const ann = await getAnnouncementById(client, announcementId);
    if (!ann) return data({ error: "Not found" }, { status: 404 });
    if (!roleAtLeast(role, "manager") && ann.authorId !== user.id) {
      return data({ error: "본인 작성분만 삭제 가능" }, { status: 403 });
    }
    const res = await deleteAnnouncement(client, announcementId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "announcement.delete",
      entityType: "announcement",
      entityId: announcementId,
      metadata: { title: ann.title },
    });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

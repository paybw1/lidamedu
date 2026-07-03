// 팝업 공지 CRUD API — manager+ 전용. RLS(popup_notices_staff_manage)와 이중 게이트.

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import {
  createPopupNotice,
  deletePopupNotice,
  updatePopupNotice,
} from "~/features/admin/queries/popup-notices.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/popup-notice";

const schema = z.object({
  intent: z.enum(["create", "update"]),
  noticeId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5000),
  youtubeUrl: z
    .string()
    .url()
    .refine((u) => extractYoutubeId(u) !== null, {
      message: "유튜브 영상 URL 이 아닙니다 (youtube.com/watch 또는 youtu.be)",
    })
    .nullable(),
  linkUrl: z.string().url().nullable(),
  linkLabel: z.string().max(60).nullable(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
});

// 유튜브 영상 ID 추출 — watch?v= / youtu.be/ / shorts/ / embed/ 수용.
function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

const IMAGE_BUCKET = "popup-notices";
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function toIso(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s); // datetime-local(브라우저 로컬) → ISO
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
    const noticeId = String(fd.get("noticeId") ?? "");
    if (!z.string().uuid().safeParse(noticeId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const del = await deletePopupNotice(client, noticeId);
    if (!del.ok) return data({ error: del.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "popup_notice.delete",
      entityType: "popup_notice",
      entityId: noticeId,
    });
    return data({ ok: true });
  }

  const parsed = schema.safeParse({
    intent: fd.get("intent"),
    noticeId: toNullable(fd.get("noticeId")),
    title: fd.get("title"),
    bodyMd: String(fd.get("bodyMd") ?? ""),
    youtubeUrl: toNullable(fd.get("youtubeUrl")),
    linkUrl: toNullable(fd.get("linkUrl")),
    linkLabel: toNullable(fd.get("linkLabel")),
    startsAt: toIso(fd.get("startsAt")),
    endsAt: toIso(fd.get("endsAt")),
    isActive: fd.get("isActive") === "1",
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }

  // 이미지 — 새 파일 업로드 > 제거 체크 > 기존 유지.
  //   업로드는 service_role(adminClient) — public 버킷이지만 쓰기 정책 없음.
  let imageUrl = toNullable(fd.get("existingImageUrl"));
  if (fd.get("removeImage") === "1") imageUrl = null;
  const imageFile = fd.get("imageFile");
  if (imageFile instanceof File && imageFile.size > 0) {
    if (imageFile.size > IMAGE_MAX_SIZE) {
      return data({ error: "이미지는 5MB 이하만 가능합니다." }, { status: 400 });
    }
    if (!IMAGE_MIMES.has(imageFile.type)) {
      return data(
        { error: "이미지(jpg/png/webp/gif)만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }
    const ext = imageFile.name.includes(".")
      ? imageFile.name.split(".").pop()
      : "png";
    const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await adminClient.storage
      .from(IMAGE_BUCKET)
      .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
    if (upErr) return data({ error: upErr.message }, { status: 400 });
    imageUrl = adminClient.storage.from(IMAGE_BUCKET).getPublicUrl(path)
      .data.publicUrl;
  }

  const input = {
    title: parsed.data.title,
    bodyMd: parsed.data.bodyMd,
    imageUrl,
    youtubeUrl: parsed.data.youtubeUrl,
    linkUrl: parsed.data.linkUrl,
    linkLabel: parsed.data.linkLabel,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    isActive: parsed.data.isActive,
  };

  if (parsed.data.intent === "create") {
    const res = await createPopupNotice(client, input, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "popup_notice.create",
      entityType: "popup_notice",
      entityId: res.noticeId,
      metadata: { title: input.title },
    });
    return data({ ok: true });
  }

  if (!parsed.data.noticeId) {
    return data({ error: "noticeId 누락" }, { status: 400 });
  }
  const res = await updatePopupNotice(client, parsed.data.noticeId, input);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  void logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "popup_notice.update",
    entityType: "popup_notice",
    entityId: parsed.data.noticeId,
    metadata: { title: input.title },
  });
  return data({ ok: true });
}

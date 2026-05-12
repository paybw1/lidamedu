// 법 개정 워크스페이스 CRUD + 발행 API. staff (instructor/admin) 만.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  addArticleToDraft,
  createLawRevision,
  deleteDraftLawRevision,
  findArticleByNumber,
  publishLawRevision,
  removeArticleFromDraft,
  updateDraftArticle,
  updateLawRevisionMeta,
} from "~/features/law-revisions/queries.server";
import type { ArticleChangeKind } from "~/features/law-revisions/labels";

import type { Route } from "./+types/law-revision";

function emptyToNull(raw: FormDataEntryValue | null, max = 5000): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

function normalizeArticleNumber(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^제\s*/, "");
  s = s.replace(/\s*조$/, "");
  s = s.replace(/\s+/g, "");
  return s;
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
    const schema = z.object({
      lawId: z.string().uuid(),
      revisionNumber: z.string().trim().min(1).max(100),
      reasonMd: z.string().trim().max(5000).nullable().optional(),
    });
    const parsed = schema.safeParse({
      lawId: fd.get("lawId"),
      revisionNumber: fd.get("revisionNumber"),
      reasonMd: emptyToNull(fd.get("reasonMd"), 5000),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await createLawRevision(client, parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, lawRevisionId: res.lawRevisionId });
  }

  if (intent === "update_meta") {
    const schema = z.object({
      lawRevisionId: z.string().uuid(),
      revisionNumber: z.string().trim().min(1).max(100).optional(),
      reasonMd: z.string().trim().max(20000).nullable().optional(),
      videoUrl: z.string().trim().url().max(2000).nullable().optional(),
      revisionKind: z.enum(["act", "decree", "rule"]).optional(),
      status: z.enum(["draft", "review", "published"]).optional(),
    });
    const parsed = schema.safeParse({
      lawRevisionId: fd.get("lawRevisionId"),
      revisionNumber: fd.get("revisionNumber") ?? undefined,
      reasonMd:
        fd.has("reasonMd") ? emptyToNull(fd.get("reasonMd"), 20000) : undefined,
      videoUrl:
        fd.has("videoUrl") ? emptyToNull(fd.get("videoUrl"), 2000) : undefined,
      revisionKind: fd.get("revisionKind") ?? undefined,
      status: fd.get("status") ?? undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updateLawRevisionMeta(client, parsed.data.lawRevisionId, {
      revisionNumber: parsed.data.revisionNumber,
      reasonMd: parsed.data.reasonMd,
      videoUrl: parsed.data.videoUrl,
      revisionKind: parsed.data.revisionKind,
      // published 로 직접 전환은 발행 RPC 만 허용.
      status: parsed.data.status === "published" ? undefined : parsed.data.status,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "upload_pdf" || intent === "remove_pdf") {
    // 파일 업로드/삭제 — comparison_pdf / explanation_pdf 컬럼.
    const fieldRaw = String(fd.get("field") ?? "");
    if (fieldRaw !== "comparison_pdf" && fieldRaw !== "explanation_pdf") {
      return data({ error: "Invalid field" }, { status: 400 });
    }
    const lawRevisionId = String(fd.get("lawRevisionId") ?? "");
    if (!z.string().uuid().safeParse(lawRevisionId).success) {
      return data({ error: "Invalid lawRevisionId" }, { status: 400 });
    }

    if (intent === "remove_pdf") {
      // 기존 URL 에서 storage path 추출 → 객체 삭제 시도 (외부 URL 일 수도 있어 best-effort).
      const { data: existing } = await client
        .from("law_revisions")
        .select(fieldRaw)
        .eq("law_revision_id", lawRevisionId)
        .maybeSingle();
      const existingUrl = (existing as Record<string, string | null> | null)?.[
        fieldRaw
      ];
      if (existingUrl) {
        const m = existingUrl.match(
          /\/storage\/v1\/object\/public\/law-revision-files\/(.+)$/,
        );
        if (m) {
          await client.storage.from("law-revision-files").remove([m[1]]);
        }
      }
      const { error: updErr } = await client
        .from("law_revisions")
        .update({ [fieldRaw]: null })
        .eq("law_revision_id", lawRevisionId);
      if (updErr) return data({ error: updErr.message }, { status: 400 });
      return data({ ok: true });
    }

    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return data({ error: "PDF 파일만 업로드 가능합니다." }, { status: 400 });
    }
    if (file.size > 30 * 1024 * 1024) {
      return data({ error: "파일이 30MB 를 초과합니다." }, { status: 400 });
    }

    const ts = Date.now();
    const safeBase = (file.name || "file.pdf")
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/[^\w.-]+/g, "_")
      .slice(-80);
    const objectPath = `${lawRevisionId}/${fieldRaw}-${ts}-${safeBase}`;

    const { error: upErr } = await client.storage
      .from("law-revision-files")
      .upload(objectPath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    const { data: pub } = client.storage
      .from("law-revision-files")
      .getPublicUrl(objectPath);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await client
      .from("law_revisions")
      .update({ [fieldRaw]: publicUrl })
      .eq("law_revision_id", lawRevisionId);
    if (updErr) return data({ error: updErr.message }, { status: 400 });

    return data({ ok: true, url: publicUrl });
  }

  if (intent === "delete") {
    const lawRevisionId = String(fd.get("lawRevisionId") ?? "");
    if (!z.string().uuid().safeParse(lawRevisionId).success) {
      return data({ error: "Invalid lawRevisionId" }, { status: 400 });
    }
    const res = await deleteDraftLawRevision(client, lawRevisionId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "add_article") {
    const lawRevisionId = String(fd.get("lawRevisionId") ?? "");
    const lawId = String(fd.get("lawId") ?? "");
    const articleNumber = normalizeArticleNumber(
      String(fd.get("articleNumber") ?? ""),
    );
    const changeKindRaw = String(fd.get("changeKind") ?? "amended");
    if (
      !z.string().uuid().safeParse(lawRevisionId).success ||
      !z.string().uuid().safeParse(lawId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    if (!articleNumber) {
      return data({ error: "조문번호 누락" }, { status: 400 });
    }
    const changeKind: ArticleChangeKind =
      changeKindRaw === "created" ||
      changeKindRaw === "amended" ||
      changeKindRaw === "deleted"
        ? changeKindRaw
        : "amended";
    const article = await findArticleByNumber(client, lawId, articleNumber);
    if (!article) {
      return data(
        { error: `제${articleNumber}조 조문 미존재` },
        { status: 400 },
      );
    }
    const res = await addArticleToDraft(
      client,
      lawRevisionId,
      article.articleId,
      changeKind,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, revisionId: res.revisionId });
  }

  if (intent === "update_article") {
    const revisionId = String(fd.get("revisionId") ?? "");
    if (!z.string().uuid().safeParse(revisionId).success) {
      return data({ error: "Invalid revisionId" }, { status: 400 });
    }
    const bodyJsonRaw = fd.get("bodyJson");
    let bodyJson: unknown | undefined;
    if (typeof bodyJsonRaw === "string" && bodyJsonRaw.trim() !== "") {
      try {
        bodyJson = JSON.parse(bodyJsonRaw);
      } catch {
        return data({ error: "JSON 형식이 올바르지 않습니다." }, { status: 400 });
      }
    }
    const changeKindRaw = fd.get("changeKind");
    const changeKind: ArticleChangeKind | undefined =
      changeKindRaw === "created" ||
      changeKindRaw === "amended" ||
      changeKindRaw === "deleted"
        ? changeKindRaw
        : undefined;
    const res = await updateDraftArticle(client, revisionId, {
      bodyJson,
      changeKind,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "remove_article") {
    const revisionId = String(fd.get("revisionId") ?? "");
    if (!z.string().uuid().safeParse(revisionId).success) {
      return data({ error: "Invalid revisionId" }, { status: 400 });
    }
    const res = await removeArticleFromDraft(client, revisionId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "publish") {
    const schema = z.object({
      lawRevisionId: z.string().uuid(),
      promulgatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const parsed = schema.safeParse({
      lawRevisionId: fd.get("lawRevisionId"),
      promulgatedAt: fd.get("promulgatedAt"),
      effectiveDate: fd.get("effectiveDate"),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await publishLawRevision(
      client,
      parsed.data.lawRevisionId,
      parsed.data.promulgatedAt,
      parsed.data.effectiveDate,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

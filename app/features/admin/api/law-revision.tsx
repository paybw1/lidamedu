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
      reasonMd: z.string().trim().max(5000).nullable().optional(),
      status: z.enum(["draft", "review", "published"]).optional(),
    });
    const parsed = schema.safeParse({
      lawRevisionId: fd.get("lawRevisionId"),
      revisionNumber: fd.get("revisionNumber") ?? undefined,
      reasonMd: emptyToNull(fd.get("reasonMd"), 5000),
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
      reasonMd: parsed.data.reasonMd ?? null,
      // published 로 직접 전환은 발행 RPC 만 허용.
      status: parsed.data.status === "published" ? undefined : parsed.data.status,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
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

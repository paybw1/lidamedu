// 법 개정 워크스페이스 CRUD + 발행 API. staff (instructor/admin) 만.

import { data } from "react-router";
import { z } from "zod";

import { assertSubjectWritable } from "~/core/lib/staff-subject-guard.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { regenerateForRevisions } from "~/features/errata/pdf/regenerate.server";
import { reindexArticles } from "~/features/ai-qna/lib/source-chunker.server";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  addArticleToDraft,
  applyLawRevision,
  createLawRevision,
  deleteDraftLawRevision,
  findArticleByNumber,
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

  // feat-7-041 — 강사는 담당 과목 법령의 개정 작업만 가능(admin/manager 전 과목).
  if (role === "instructor") {
    const uuid = z.string().uuid();
    let lawCode: string | null = null;
    const lawIdRaw = String(fd.get("lawId") ?? "");
    const revIdRaw = String(fd.get("lawRevisionId") ?? "");
    if (uuid.safeParse(lawIdRaw).success) {
      const { data: law } = await client
        .from("laws")
        .select("law_code")
        .eq("law_id", lawIdRaw)
        .maybeSingle();
      lawCode = law?.law_code ?? null;
    } else if (uuid.safeParse(revIdRaw).success) {
      const { data: rev } = await client
        .from("law_revisions")
        .select("laws(law_code)")
        .eq("law_revision_id", revIdRaw)
        .maybeSingle();
      lawCode = rev?.laws?.law_code ?? null;
    }
    await assertSubjectWritable(role, user.id, lawCode ?? []);
  }

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
    const dateSchema = z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional();
    const schema = z.object({
      lawRevisionId: z.string().uuid(),
      revisionNumber: z.string().trim().min(1).max(100).optional(),
      reasonMd: z.string().trim().max(20000).nullable().optional(),
      videoUrl: z.string().trim().url().max(2000).nullable().optional(),
      revisionKind: z.enum(["act", "decree", "rule"]).optional(),
      promulgatedAt: dateSchema,
      effectiveDate: dateSchema,
    });
    const parsed = schema.safeParse({
      lawRevisionId: fd.get("lawRevisionId"),
      revisionNumber: fd.get("revisionNumber") ?? undefined,
      reasonMd:
        fd.has("reasonMd") ? emptyToNull(fd.get("reasonMd"), 20000) : undefined,
      videoUrl:
        fd.has("videoUrl") ? emptyToNull(fd.get("videoUrl"), 2000) : undefined,
      revisionKind: fd.get("revisionKind") ?? undefined,
      promulgatedAt: fd.has("promulgatedAt")
        ? emptyToNull(fd.get("promulgatedAt"), 10)
        : undefined,
      effectiveDate: fd.has("effectiveDate")
        ? emptyToNull(fd.get("effectiveDate"), 10)
        : undefined,
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
      promulgatedAt: parsed.data.promulgatedAt,
      effectiveDate: parsed.data.effectiveDate,
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
        { error: `${articleDisplayPrefix(articleNumber)} 조문 미존재` },
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

  if (intent === "bulk_add_articles") {
    const lawRevisionId = String(fd.get("lawRevisionId") ?? "");
    const lawId = String(fd.get("lawId") ?? "");
    const articleNumbersRaw = String(fd.get("articleNumbers") ?? "");
    const changeKindRaw = String(fd.get("changeKind") ?? "amended");
    if (
      !z.string().uuid().safeParse(lawRevisionId).success ||
      !z.string().uuid().safeParse(lawId).success
    ) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const changeKind: ArticleChangeKind =
      changeKindRaw === "created" ||
      changeKindRaw === "amended" ||
      changeKindRaw === "deleted"
        ? changeKindRaw
        : "amended";
    // 콤마·세미콜론·줄바꿈·공백 분리.
    const numbers = articleNumbersRaw
      .split(/[\s,;]+/)
      .map((s) => normalizeArticleNumber(s))
      .filter((s) => s.length > 0);
    if (numbers.length === 0) {
      return data({ error: "추가할 조문 번호 없음" }, { status: 400 });
    }
    if (numbers.length > 50) {
      return data(
        { error: `한 번에 최대 50개 (입력 ${numbers.length}개)` },
        { status: 400 },
      );
    }
    const added: string[] = [];
    const skipped: Array<{ number: string; reason: string }> = [];
    for (const n of numbers) {
      const article = await findArticleByNumber(client, lawId, n);
      if (!article) {
        skipped.push({ number: n, reason: "조문 미존재" });
        continue;
      }
      const res = await addArticleToDraft(
        client,
        lawRevisionId,
        article.articleId,
        changeKind,
        user.id,
      );
      if (!res.ok) {
        skipped.push({ number: n, reason: res.error });
        continue;
      }
      added.push(n);
    }
    return data({ ok: true, added, skipped });
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

  if (intent === "apply") {
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
    const res = await applyLawRevision(
      client,
      parsed.data.lawRevisionId,
      parsed.data.promulgatedAt,
      parsed.data.effectiveDate,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });

    // feat-9-001 RAG dirty hook — 반영된 개정의 영향 조문 청크 재생성.
    // 반영 후 article_revisions.law_revision_id 로 영향 article_id 추출.
    runAfterResponse(
      (async () => {
        const { data: affected } = await client
          .from("article_revisions")
          .select("article_id")
          .eq("law_revision_id", parsed.data.lawRevisionId);
        const ids = [
          ...new Set((affected ?? []).map((r) => r.article_id)),
        ].filter((x): x is string => x !== null);
        if (ids.length > 0) await reindexArticles(ids);
      })(),
    );

    // errata Phase 3 §6 — 발행 연동: 개정 반영이 만든 원장(statute) 기록을 곧바로
    // 추록으로 발행한다(kind=law_amend 고정). apply_status(applied/scheduled)는
    // 원장 트리거가 시행일 기준으로 이미 판정했다.
    // ★발행은 원장·관리자 전용(§2) — instructor 반영이면 기존 흐름 그대로 두고
    //   원장 기록은 none 으로 남긴다(이후 수동 발행). 기존 apply 동작은 불변.
    let errataPublished = 0;
    if (role === "manager" || role === "admin") {
      const { data: ledger } = await client
        .from("content_revisions")
        .select("revision_id")
        .eq("content_type", "statute")
        .eq("notice_status", "none")
        .filter(
          "after_snapshot->>law_revision_id",
          "eq",
          parsed.data.lawRevisionId,
        );
      const ledgerIds = (ledger ?? []).map((r) => r.revision_id);
      if (ledgerIds.length > 0) {
        const { data: published, error: pubErr } = await client.rpc(
          "fn_publish_errata",
          {
            p_revision_ids: ledgerIds,
            p_errata_kind: "law_amend",
            p_errata_severity: "normal",
            p_errata_title: `법령개정 반영 (시행 ${parsed.data.effectiveDate})`,
            p_errata_payload: {
              comparison_table: {
                source: "law_revision",
                law_revision_id: parsed.data.lawRevisionId,
                promulgated_at: parsed.data.promulgatedAt,
                effective_date: parsed.data.effectiveDate,
              },
            },
            p_errata_reason: `공포 ${parsed.data.promulgatedAt} · 시행 ${parsed.data.effectiveDate}`,
          },
        );
        if (!pubErr) {
          errataPublished = (published ?? []).length;
          // §3.3 — 발행된 조문 원장 묶음의 영향 교재 시트 재렌더 (실패는 발행과 격리).
          if (errataPublished > 0) {
            runAfterResponse(
              regenerateForRevisions((published ?? []) as string[]),
            );
          }
        }
      }
    }
    return data({ ok: true, errataPublished });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

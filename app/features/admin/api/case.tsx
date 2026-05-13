// 판례 등록/수정 API (feat-7-005). staff(instructor/admin) 전용.

import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case";

function parseIntList(raw: FormDataEntryValue | null): number[] {
  if (!raw) return [];
  const s = String(raw);
  return s
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p))
    .map((p) => parseInt(p, 10));
}

function parseStringArray(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const courtEnum = z.enum([
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
]);

const upsertSchema = z.object({
  subjectLaws: z.array(z.string()).min(1, "subject_laws 필수"),
  court: courtEnum,
  decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  caseNumber: z.string().trim().min(1).max(100),
  caseTitle: z.string().trim().min(1).max(500),
  isEnBanc: z.boolean(),
  importance: z.number().int().min(0).max(5).nullable(),
  caseType: z.string().trim().max(100).nullable(),
  summaryTitle: z.string().trim().max(500).nullable(),
  summaryBodyMd: z.string().max(20_000).nullable(),
  reasoningMd: z.string().max(50_000).nullable(),
  commentSource: z.string().trim().max(500).nullable(),
  commentBodyMd: z.string().max(50_000).nullable(),
  exam1stYears: z.array(z.number().int().min(1990).max(2099)),
  exam2ndYears: z.array(z.number().int().min(1990).max(2099)),
});

// 판결전문 PDF storage 버킷.
const FULL_TEXT_PDF_BUCKET = "case-full-text-pdfs";
const FULL_TEXT_PDF_MAX_BYTES = 30 * 1024 * 1024;
const FULL_TEXT_PDF_URL_RE = new RegExp(
  `/storage/v1/object/public/${FULL_TEXT_PDF_BUCKET}/(.+)$`,
);

function emptyToNull(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
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
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "delete") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid id" }, { status: 400 });
    }
    const { error } = await client
      .from("cases")
      .update({ deleted_at: new Date().toISOString() })
      .eq("case_id", caseId);
    if (error) return data({ error: error.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.delete",
      entityType: "case",
      entityId: caseId,
    });
    return redirect("/admin/cases?law=patent");
  }

  if (intent === "upload_full_text_pdf" || intent === "remove_full_text_pdf") {
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }

    // 기존 PDF 가 storage 에 있으면 우선 제거 (교체/제거 공통). 외부 URL 은 best-effort skip.
    const { data: existing } = await client
      .from("cases")
      .select("full_text_pdf, case_number")
      .eq("case_id", caseId)
      .maybeSingle();
    const existingUrl = existing?.full_text_pdf ?? null;
    if (existingUrl) {
      const m = existingUrl.match(FULL_TEXT_PDF_URL_RE);
      if (m) {
        await client.storage.from(FULL_TEXT_PDF_BUCKET).remove([m[1]]);
      }
    }

    if (intent === "remove_full_text_pdf") {
      const { error } = await client
        .from("cases")
        .update({ full_text_pdf: null })
        .eq("case_id", caseId);
      if (error) return data({ error: error.message }, { status: 400 });
      void logAuditEvent({
        actorId: user.id,
        actorRole: role,
        action: "case.remove_full_text_pdf",
        entityType: "case",
        entityId: caseId,
      });
      return data({ ok: true });
    }

    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return data({ error: "PDF 파일만 업로드 가능합니다." }, { status: 400 });
    }
    if (file.size > FULL_TEXT_PDF_MAX_BYTES) {
      return data({ error: "파일이 30MB 를 초과합니다." }, { status: 400 });
    }

    const ts = Date.now();
    const safeBase = (file.name || "case.pdf")
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/[^\w.-]+/g, "_")
      .slice(-80);
    const objectPath = `${caseId}/${ts}-${safeBase}`;

    const { error: upErr } = await client.storage
      .from(FULL_TEXT_PDF_BUCKET)
      .upload(objectPath, file, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) return data({ error: upErr.message }, { status: 400 });

    const { data: pub } = client.storage
      .from(FULL_TEXT_PDF_BUCKET)
      .getPublicUrl(objectPath);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await client
      .from("cases")
      .update({ full_text_pdf: publicUrl })
      .eq("case_id", caseId);
    if (updErr) return data({ error: updErr.message }, { status: 400 });

    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.upload_full_text_pdf",
      entityType: "case",
      entityId: caseId,
      metadata: {
        caseNumber: existing?.case_number ?? null,
        bytes: file.size,
      },
    });
    return data({ ok: true, url: publicUrl });
  }

  if (intent !== "create" && intent !== "update") {
    return data({ error: "Unknown intent" }, { status: 400 });
  }

  const subjectLaws = parseStringArray(fd.get("subjectLaws")).filter((s) =>
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(s),
  );
  const parsed = upsertSchema.safeParse({
    subjectLaws,
    court: fd.get("court"),
    decidedAt: fd.get("decidedAt"),
    caseNumber: fd.get("caseNumber"),
    caseTitle: fd.get("caseTitle"),
    isEnBanc: fd.get("isEnBanc") === "1",
    importance: fd.get("importance")
      ? Number(fd.get("importance"))
      : null,
    caseType: emptyToNull(fd.get("caseType")),
    summaryTitle: emptyToNull(fd.get("summaryTitle")),
    summaryBodyMd: emptyToNull(fd.get("summaryBodyMd")),
    reasoningMd: emptyToNull(fd.get("reasoningMd")),
    commentSource: emptyToNull(fd.get("commentSource")),
    commentBodyMd: emptyToNull(fd.get("commentBodyMd")),
    exam1stYears: parseIntList(fd.get("exam1stYears")),
    exam2ndYears: parseIntList(fd.get("exam2ndYears")),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // summary_items 단순화 — title+body 단일 항목으로 합산. 후속 multi-item UI 는 별도.
  const summaryItems =
    input.summaryBodyMd || input.summaryTitle
      ? [
          {
            title: input.summaryTitle ?? "",
            body: input.summaryBodyMd ?? "",
          },
        ]
      : [];

  // full_text_pdf 컬럼은 별도 intent(upload/remove)로만 변경 — 메타 폼은 건드리지 않는다.
  const payload = {
    subject_laws: input.subjectLaws,
    court: input.court,
    decided_at: input.decidedAt,
    case_number: input.caseNumber,
    case_title: input.caseTitle,
    is_en_banc: input.isEnBanc,
    importance: input.importance,
    case_type: input.caseType,
    summary_title: input.summaryTitle,
    summary_body_md: input.summaryBodyMd,
    reasoning_md: input.reasoningMd,
    comment_source: input.commentSource,
    comment_body_md: input.commentBodyMd,
    exam_1st_years: input.exam1stYears,
    exam_2nd_years: input.exam2ndYears,
    summary_items: summaryItems,
  };

  if (intent === "create") {
    const { data: row, error } = await client
      .from("cases")
      .insert(payload)
      .select("case_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    void logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "case.create",
      entityType: "case",
      entityId: row.case_id,
      metadata: {
        caseNumber: input.caseNumber,
        caseTitle: input.caseTitle,
        court: input.court,
      },
    });
    throw redirect(`/admin/cases/edit/${row.case_id}`);
  }

  // update
  const caseId = String(fd.get("caseId") ?? "");
  if (!z.string().uuid().safeParse(caseId).success) {
    return data({ error: "Invalid caseId" }, { status: 400 });
  }
  const { error } = await client
    .from("cases")
    .update(payload)
    .eq("case_id", caseId);
  if (error) return data({ error: error.message }, { status: 400 });
  void logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: "case.update",
    entityType: "case",
    entityId: caseId,
    metadata: {
      caseNumber: input.caseNumber,
      caseTitle: input.caseTitle,
    },
  });
  return data({ ok: true });
}

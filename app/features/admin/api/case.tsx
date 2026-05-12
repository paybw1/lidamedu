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
  fullTextPdf: z.string().trim().max(2000).nullable(),
  exam1stYears: z.array(z.number().int().min(1990).max(2099)),
  exam2ndYears: z.array(z.number().int().min(1990).max(2099)),
});

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
    fullTextPdf: emptyToNull(fd.get("fullTextPdf")),
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
    full_text_pdf: input.fullTextPdf,
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

// 판례 관련논문/기사 링크 CRUD API (feat-4-A-214).
// staff (instructor/admin) 만 호출 가능. 학생은 case-viewer 에서 read-only.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import type { CaseReferenceKind } from "~/features/cases/labels";
import {
  createCaseReference,
  deleteCaseReference,
  updateCaseReference,
} from "~/features/cases/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/case-reference";

const KINDS = ["paper", "article", "other"] as const;
const kindSchema = z.enum(KINDS);

// 빈 문자열은 NULL 로 정규화. trim 후 길이 제한도 같이.
function emptyToNull(raw: FormDataEntryValue | null, max = 500): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

const upsertCommonSchema = z.object({
  kind: kindSchema,
  title: z.string().trim().min(1).max(500),
  authors: z.string().trim().max(500).nullable().optional(),
  source: z.string().trim().max(500).nullable().optional(),
  publishedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  pdfUrl: z.string().trim().url().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  ord: z.coerce.number().int().min(0).max(9999).optional(),
});

function parseUpsert(fd: FormData) {
  return upsertCommonSchema.safeParse({
    kind: fd.get("kind"),
    title: fd.get("title"),
    authors: emptyToNull(fd.get("authors")),
    source: emptyToNull(fd.get("source")),
    publishedAt: emptyToNull(fd.get("publishedAt"), 10),
    url: emptyToNull(fd.get("url"), 2000),
    pdfUrl: emptyToNull(fd.get("pdfUrl"), 2000),
    note: emptyToNull(fd.get("note"), 2000),
    ord: fd.get("ord") ?? undefined,
  });
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
    const caseId = String(fd.get("caseId") ?? "");
    if (!z.string().uuid().safeParse(caseId).success) {
      return data({ error: "Invalid caseId" }, { status: 400 });
    }
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await createCaseReference(
      client,
      {
        caseId,
        kind: parsed.data.kind as CaseReferenceKind,
        title: parsed.data.title,
        authors: parsed.data.authors ?? null,
        source: parsed.data.source ?? null,
        publishedAt: parsed.data.publishedAt ?? null,
        url: parsed.data.url ?? null,
        pdfUrl: parsed.data.pdfUrl ?? null,
        note: parsed.data.note ?? null,
        ord: parsed.data.ord,
      },
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, referenceId: res.referenceId });
  }

  if (intent === "update") {
    const referenceId = String(fd.get("referenceId") ?? "");
    if (!z.string().uuid().safeParse(referenceId).success) {
      return data({ error: "Invalid referenceId" }, { status: 400 });
    }
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updateCaseReference(client, referenceId, {
      kind: parsed.data.kind as CaseReferenceKind,
      title: parsed.data.title,
      authors: parsed.data.authors ?? null,
      source: parsed.data.source ?? null,
      publishedAt: parsed.data.publishedAt ?? null,
      url: parsed.data.url ?? null,
      pdfUrl: parsed.data.pdfUrl ?? null,
      note: parsed.data.note ?? null,
      ord: parsed.data.ord,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const referenceId = String(fd.get("referenceId") ?? "");
    if (!z.string().uuid().safeParse(referenceId).success) {
      return data({ error: "Invalid referenceId" }, { status: 400 });
    }
    const res = await deleteCaseReference(client, referenceId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

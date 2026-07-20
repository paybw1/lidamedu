// 논문 CRUD API (feat-3-502). staff (instructor/admin) 만 호출 가능.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  createPaper,
  deletePaper,
  updatePaper,
} from "~/features/papers/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/paper";

function emptyToNull(raw: FormDataEntryValue | null, max = 500): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, max);
}

function parseSubjectLaws(raw: FormDataEntryValue | null): LawSubjectSlug[] {
  if (raw === null) return [];
  const s = String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return s.filter((x): x is LawSubjectSlug =>
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(x),
  );
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (raw === null) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);
}

const upsertSchema = z.object({
  title: z.string().trim().min(1).max(500),
  authors: z.string().trim().max(500).nullable().optional(),
  source: z.string().trim().max(500).nullable().optional(),
  publishedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .nullable()
    .optional(),
  abstract: z.string().trim().max(5000).nullable().optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  pdfUrl: z.string().trim().url().max(2000).nullable().optional(),
  importance: z.coerce.number().int().min(1).max(3).optional(),
});

function parseUpsert(fd: FormData) {
  const parsed = upsertSchema.safeParse({
    title: fd.get("title"),
    authors: emptyToNull(fd.get("authors")),
    source: emptyToNull(fd.get("source")),
    publishedAt: emptyToNull(fd.get("publishedAt"), 10),
    abstract: emptyToNull(fd.get("abstract"), 5000),
    url: emptyToNull(fd.get("url"), 2000),
    pdfUrl: emptyToNull(fd.get("pdfUrl"), 2000),
    importance: fd.get("importance") ?? undefined,
  });
  if (!parsed.success) return parsed;
  return {
    success: true as const,
    data: {
      ...parsed.data,
      subjectLaws: parseSubjectLaws(fd.get("subjectLaws")),
      tags: parseTags(fd.get("tags")),
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
    const res = await createPaper(
      client,
      {
        title: parsed.data.title,
        authors: parsed.data.authors ?? null,
        source: parsed.data.source ?? null,
        publishedAt: parsed.data.publishedAt ?? null,
        abstract: parsed.data.abstract ?? null,
        url: parsed.data.url ?? null,
        pdfUrl: parsed.data.pdfUrl ?? null,
        subjectLaws: parsed.data.subjectLaws,
        importance: parsed.data.importance ?? 1,
        tags: parsed.data.tags,
      },
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, paperId: res.paperId });
  }

  if (intent === "update") {
    const paperId = String(fd.get("paperId") ?? "");
    if (!z.string().uuid().safeParse(paperId).success) {
      return data({ error: "Invalid paperId" }, { status: 400 });
    }
    const parsed = parseUpsert(fd);
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await updatePaper(client, paperId, {
      title: parsed.data.title,
      authors: parsed.data.authors ?? null,
      source: parsed.data.source ?? null,
      publishedAt: parsed.data.publishedAt ?? null,
      abstract: parsed.data.abstract ?? null,
      url: parsed.data.url ?? null,
      pdfUrl: parsed.data.pdfUrl ?? null,
      subjectLaws: parsed.data.subjectLaws,
      importance: parsed.data.importance ?? 1,
      tags: parsed.data.tags,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const paperId = String(fd.get("paperId") ?? "");
    if (!z.string().uuid().safeParse(paperId).success) {
      return data({ error: "Invalid paperId" }, { status: 400 });
    }
    const res = await deletePaper(client, paperId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

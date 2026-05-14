// 강사 1:1 상담 코멘트 CRUD API (feat-7-025).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  createNote,
  deleteNote,
  updateNote,
  type StudentNoteVisibility,
} from "~/features/student-notes/queries.server";

import type { Route } from "./+types/student-note";

const VISIBILITIES: StudentNoteVisibility[] = [
  "staff_only",
  "share_with_student",
];

const createSchema = z.object({
  studentId: z.string().uuid(),
  bodyMd: z.string().trim().min(1).max(4000),
  visibility: z.enum(["staff_only", "share_with_student"]),
  isPinned: z.coerce.boolean().optional(),
});

const updateSchema = z.object({
  bodyMd: z.string().trim().min(1).max(4000).optional(),
  visibility: z.enum(["staff_only", "share_with_student"]).optional(),
  isPinned: z.coerce.boolean().optional(),
});

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
    const parsed = createSchema.safeParse({
      studentId: fd.get("studentId"),
      bodyMd: fd.get("bodyMd"),
      visibility: fd.get("visibility") ?? "staff_only",
      isPinned: fd.has("isPinned"),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await createNote({
      studentId: parsed.data.studentId,
      authorId: user.id,
      bodyMd: parsed.data.bodyMd,
      visibility: parsed.data.visibility,
      isPinned: parsed.data.isPinned ?? false,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, noteId: res.noteId });
  }

  if (intent === "update") {
    const noteId = String(fd.get("noteId") ?? "");
    if (!noteId) return data({ error: "noteId 누락" }, { status: 400 });
    const parsed = updateSchema.safeParse({
      bodyMd: fd.get("bodyMd") ? String(fd.get("bodyMd")) : undefined,
      visibility: fd.get("visibility") || undefined,
      isPinned: fd.has("isPinned"),
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    const res = await updateNote(noteId, user.id, role === "admin", parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const noteId = String(fd.get("noteId") ?? "");
    if (!noteId) return data({ error: "noteId 누락" }, { status: 400 });
    const res = await deleteNote(noteId, user.id, role === "admin");
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // VISIBILITIES export 회피용 ref (unused warning suppression)
  void VISIBILITIES;
  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

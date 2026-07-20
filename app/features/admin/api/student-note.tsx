// 강사 1:1 상담 코멘트 CRUD API (feat-7-025).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
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

// feat-7-025 보안 — instructor 가 대상 학생을 관리할 권한이 있는지(본인 소유 cohort 의 멤버인지).
// admin-student-detail loader 의 ownsAnyCohort 와 동일 기준. manager+ 는 caller 에서 프리패스.
async function instructorOwnsStudent(
  studentId: string,
  userId: string,
): Promise<boolean> {
  const { data: rows } = await adminClient
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(owner_id)")
    .eq("profile_id", studentId);
  return (rows ?? []).some((r) => r.cohorts?.owner_id === userId);
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
    // 보안 — create 만 임의 studentId 를 폼으로 받으므로 cohort 소유권 게이트.
    // (update/delete 는 author 게이트로 안전. RLS student_notes_author_all 은
    //  author_id 기준이라 cohort 를 막지 못한다 → 여기 action 게이트가 유일 방어.)
    if (!roleAtLeast(role, "manager")) {
      const owns = await instructorOwnsStudent(parsed.data.studentId, user.id);
      if (!owns) {
        return data(
          { error: "담당 반(cohort) 학생에게만 코멘트를 작성할 수 있습니다." },
          { status: 403 },
        );
      }
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
    const res = await updateNote(noteId, user.id, roleAtLeast(role, "manager"), parsed.data);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const noteId = String(fd.get("noteId") ?? "");
    if (!noteId) return data({ error: "noteId 누락" }, { status: 400 });
    const res = await deleteNote(noteId, user.id, roleAtLeast(role, "manager"));
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  // VISIBILITIES export 회피용 ref (unused warning suppression)
  void VISIBILITIES;
  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";

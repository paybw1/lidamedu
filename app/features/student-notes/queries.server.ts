// 강사 1:1 상담 코멘트 (feat-7-025).
// staff 권한 검사는 caller(loader/action) 선행. 함수 내부는 admin client 우회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { createStaffNotifications } from "~/features/notifications/queries.server";

export type StudentNoteVisibility = "staff_only" | "share_with_student";

export interface StudentNote {
  noteId: string;
  studentId: string;
  authorId: string;
  authorName: string | null;
  bodyMd: string;
  visibility: StudentNoteVisibility;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listNotesForStudent(
  studentId: string,
  options: { onlyShared?: boolean } = {},
): Promise<StudentNote[]> {
  const admin = adminClient as SupabaseClient<Database>;
  let q = admin
    .from("student_notes")
    .select(
      "note_id, student_id, author_id, body_md, visibility, is_pinned, created_at, updated_at, profiles!author_id(name)",
    )
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (options.onlyShared) {
    q = q.eq("visibility", "share_with_student");
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    noteId: r.note_id,
    studentId: r.student_id,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    bodyMd: r.body_md,
    visibility: r.visibility as StudentNoteVisibility,
    isPinned: r.is_pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createNote(input: {
  studentId: string;
  authorId: string;
  bodyMd: string;
  visibility: StudentNoteVisibility;
  isPinned?: boolean;
}): Promise<{ ok: true; noteId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("student_notes")
    .insert({
      student_id: input.studentId,
      author_id: input.authorId,
      body_md: input.bodyMd,
      visibility: input.visibility,
      is_pinned: input.isPinned ?? false,
    })
    .select("note_id")
    .single();
  if (error) return { ok: false, error: error.message };
  // feat-7-028 — share_with_student 인 경우 학생 inbox 에 알림 (best-effort)
  if (input.visibility === "share_with_student") {
    const preview =
      input.bodyMd.length > 120
        ? `${input.bodyMd.slice(0, 120)}…`
        : input.bodyMd;
    await createStaffNotifications({
      recipientIds: [input.studentId],
      kind: "student_note_shared",
      entityType: "student_note",
      entityId: data.note_id,
      title: "강사의 새 코멘트가 도착했습니다",
      body: preview,
      href: `/me/consult?note=${data.note_id}`,
    });
  }
  return { ok: true, noteId: data.note_id };
}

export async function updateNote(
  noteId: string,
  authorId: string,
  isAdmin: boolean,
  patch: {
    bodyMd?: string;
    visibility?: StudentNoteVisibility;
    isPinned?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  // 권한: admin 이거나 author 본인
  const { data: before } = await admin
    .from("student_notes")
    .select("author_id, visibility, body_md, student_id")
    .eq("note_id", noteId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Not found" };
  if (!isAdmin && before.author_id !== authorId)
    return { ok: false, error: "Forbidden" };

  const u: Record<string, unknown> = {};
  if (patch.bodyMd !== undefined) u.body_md = patch.bodyMd;
  if (patch.visibility !== undefined) u.visibility = patch.visibility;
  if (patch.isPinned !== undefined) u.is_pinned = patch.isPinned;
  const { error } = await admin
    .from("student_notes")
    .update(u)
    .eq("note_id", noteId);
  if (error) return { ok: false, error: error.message };

  // feat-7-028 — visibility 가 staff_only → share_with_student 로 바뀐 경우만 알림
  if (
    patch.visibility === "share_with_student" &&
    before.visibility !== "share_with_student"
  ) {
    const body = patch.bodyMd ?? before.body_md;
    const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
    await createStaffNotifications({
      recipientIds: [before.student_id],
      kind: "student_note_shared",
      entityType: "student_note",
      entityId: noteId,
      title: "강사의 새 코멘트가 도착했습니다",
      body: preview,
      href: `/me/consult?note=${noteId}`,
    });
  }
  return { ok: true };
}

export async function deleteNote(
  noteId: string,
  authorId: string,
  isAdmin: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  if (!isAdmin) {
    const { data } = await admin
      .from("student_notes")
      .select("author_id")
      .eq("note_id", noteId)
      .maybeSingle();
    if (!data) return { ok: false, error: "Not found" };
    if (data.author_id !== authorId) return { ok: false, error: "Forbidden" };
  }
  const { error } = await admin
    .from("student_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("note_id", noteId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

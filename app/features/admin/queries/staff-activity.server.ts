// 운영자 "내 활동" — 내가 학생/반에 한 조치(상담 코멘트·과제 부여)와 상대 반응을 한곳에.
// staff 게이트는 caller(loader) 선행. 내부는 adminClient 우회(profiles RLS 는 staff 에게도 본인만).
//
// 반응 신호:
//   - 상담 코멘트(share_with_student): read_at 유무 = 학생 열람 여부.
//     staff_only 는 학생에게 노출 자체가 안 되므로 반응 개념 없음(내부 메모로 표시).
//   - 과제: assignment_submissions 완료 인원 / 대상 인원. 카운트는 학생/운영자가
//     해당 과제를 열 때 recompute 되므로 약간 지연될 수 있다(드릴다운은 최신 재계산).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type { BugReportStatus } from "~/features/bug-reports/labels";
import type { QnaStatus } from "~/features/qna/labels";
import type { StudentNoteVisibility } from "~/features/student-notes/queries.server";

const NOTE_LIMIT = 100;
const ASSIGNMENT_LIMIT = 100;
const QNA_LIMIT = 100;
const BUG_LIMIT = 100;

export interface ActivityNote {
  noteId: string;
  studentId: string;
  studentName: string | null;
  preview: string;
  visibility: StudentNoteVisibility;
  createdAt: string;
  readAt: string | null;
}

export interface ActivityAssignment {
  assignmentId: string;
  cohortId: string;
  title: string;
  /** 개인 과제=학생명, 반 과제=반 이름. */
  scopeLabel: string;
  targetProfileId: string | null;
  dueAt: string;
  assignedAt: string;
  completedMembers: number;
  totalMembers: number;
}

export interface ActivityQna {
  threadId: string;
  displayNo: number;
  title: string;
  askerName: string | null;
  status: QnaStatus;
  answered: boolean;
  createdAt: string;
  answeredAt: string | null;
}

export interface ActivityBug {
  reportId: string;
  reporterName: string | null;
  message: string;
  url: string;
  status: BugReportStatus;
  createdAt: string;
}

export interface StaffActivity {
  notes: ActivityNote[];
  assignments: ActivityAssignment[];
  qnaAnswers: ActivityQna[];
  bugReports: ActivityBug[];
}

function previewOf(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

export async function getStaffActivity(authorId: string): Promise<StaffActivity> {
  const admin = adminClient as SupabaseClient<Database>;

  const [notes, assignments, qnaAnswers, bugReports] = await Promise.all([
    loadMyNotes(admin, authorId),
    loadMyAssignments(admin, authorId),
    loadMyQna(admin, authorId),
    loadBugReports(admin),
  ]);
  return { notes, assignments, qnaAnswers, bugReports };
}

// 내게 배정된 Q&A(answerer_id=나) — 답변 완료 + 미답변(대기). 미답변이 '미반응'.
async function loadMyQna(
  admin: SupabaseClient<Database>,
  answererId: string,
): Promise<ActivityQna[]> {
  const { data, error } = await admin
    .from("qna_threads")
    .select(
      "thread_id, display_no, title, status, created_at, answered_at, asker_id",
    )
    .eq("answerer_id", answererId)
    .order("created_at", { ascending: false })
    .limit(QNA_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const askerIds = [...new Set(rows.map((r) => r.asker_id).filter(Boolean))];
  const nameById = await namesByProfileId(admin, askerIds);
  return rows.map((r) => ({
    threadId: r.thread_id,
    displayNo: r.display_no,
    title: r.title,
    askerName: nameById.get(r.asker_id) ?? null,
    status: r.status as QnaStatus,
    answered: r.answered_at != null,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
  }));
}

// 오류 신고 — 답변자 귀속 필드가 없어(상태만) 최근 신고 전체를 노출. 미처리(open/in_progress)가 '미반응'.
async function loadBugReports(
  admin: SupabaseClient<Database>,
): Promise<ActivityBug[]> {
  const { data, error } = await admin
    .from("bug_reports")
    .select("report_id, reporter_id, message, url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(BUG_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const reporterIds = [
    ...new Set(rows.map((r) => r.reporter_id).filter(Boolean) as string[]),
  ];
  const nameById = await namesByProfileId(admin, reporterIds);
  return rows.map((r) => ({
    reportId: r.report_id,
    reporterName: r.reporter_id ? (nameById.get(r.reporter_id) ?? null) : null,
    message: r.message,
    url: r.url,
    status: r.status as BugReportStatus,
    createdAt: r.created_at,
  }));
}

async function loadMyNotes(
  admin: SupabaseClient<Database>,
  authorId: string,
): Promise<ActivityNote[]> {
  const { data, error } = await admin
    .from("student_notes")
    .select("note_id, student_id, body_md, visibility, created_at, read_at")
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(NOTE_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const nameById = await namesByProfileId(admin, studentIds);

  return rows.map((r) => ({
    noteId: r.note_id,
    studentId: r.student_id,
    studentName: nameById.get(r.student_id) ?? null,
    preview: previewOf(r.body_md),
    visibility: r.visibility as StudentNoteVisibility,
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
}

async function loadMyAssignments(
  admin: SupabaseClient<Database>,
  authorId: string,
): Promise<ActivityAssignment[]> {
  const { data, error } = await admin
    .from("assignments")
    .select(
      "assignment_id, cohort_id, title, due_at, assigned_at, target_profile_id",
    )
    .eq("created_by", authorId)
    .is("deleted_at", null)
    .order("assigned_at", { ascending: false })
    .limit(ASSIGNMENT_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const assignmentIds = rows.map((r) => r.assignment_id);
  const cohortIds = [...new Set(rows.map((r) => r.cohort_id))];
  const targetIds = [
    ...new Set(rows.map((r) => r.target_profile_id).filter(Boolean) as string[]),
  ];

  // 완수 인원(status='completed') — assignment 별 카운트.
  const completedByA = new Map<string, number>();
  const { data: subs } = await admin
    .from("assignment_submissions")
    .select("assignment_id, status")
    .in("assignment_id", assignmentIds);
  for (const s of subs ?? []) {
    if (s.status === "completed")
      completedByA.set(
        s.assignment_id,
        (completedByA.get(s.assignment_id) ?? 0) + 1,
      );
  }

  // 반별 수강생 인원(role='student' 만 — 운영자 제외) + 반 이름.
  const studentCountByCohort = new Map<string, number>();
  const cohortNameById = new Map<string, string>();
  if (cohortIds.length > 0) {
    const { data: members } = await admin
      .from("cohort_members")
      .select(
        "cohort_id, profiles!cohort_members_profile_id_fkey(role)",
      )
      .in("cohort_id", cohortIds);
    for (const m of members ?? []) {
      if ((m.profiles?.role ?? "student") !== "student") continue;
      studentCountByCohort.set(
        m.cohort_id,
        (studentCountByCohort.get(m.cohort_id) ?? 0) + 1,
      );
    }
    const { data: cohorts } = await admin
      .from("cohorts")
      .select("cohort_id, name")
      .in("cohort_id", cohortIds);
    for (const c of cohorts ?? [])
      cohortNameById.set(c.cohort_id, c.name ?? "(반)");
  }

  const targetNameById = await namesByProfileId(admin, targetIds);

  return rows.map((r) => {
    const isPersonal = Boolean(r.target_profile_id);
    return {
      assignmentId: r.assignment_id,
      cohortId: r.cohort_id,
      title: r.title,
      scopeLabel: isPersonal
        ? (targetNameById.get(r.target_profile_id!) ?? "개인")
        : (cohortNameById.get(r.cohort_id) ?? "반"),
      targetProfileId: r.target_profile_id,
      dueAt: r.due_at,
      assignedAt: r.assigned_at,
      completedMembers: completedByA.get(r.assignment_id) ?? 0,
      totalMembers: isPersonal ? 1 : (studentCountByCohort.get(r.cohort_id) ?? 0),
    };
  });
}

async function namesByProfileId(
  admin: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await admin
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", ids);
  for (const p of data ?? []) out.set(p.profile_id, p.name ?? "회원");
  return out;
}

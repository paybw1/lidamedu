// feat-7-043 — 출결 대장 서버 쿼리. 회차 CRUD + 출석 기록 + 요약(파생, 저장 안 함).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllIn } from "~/core/lib/supa-batch.server";

import {
  EMPTY_ATTENDANCE_COUNTS,
  type AttendanceCounts,
  type AttendanceStatus,
} from "./labels";

export interface ClassSession {
  classSessionId: string;
  cohortId: string;
  sessionNo: number;
  heldOn: string;
  title: string | null;
  note: string | null;
  // 회차별 기록 요약
  counts: AttendanceCounts;
  recordedCount: number;
}

export async function listClassSessions(
  client: SupabaseClient<Database>,
  cohortId: string,
): Promise<ClassSession[]> {
  const { data: sessions, error } = await client
    .from("cohort_class_sessions")
    .select("class_session_id, cohort_id, session_no, held_on, title, note")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .order("session_no", { ascending: true })
    .order("held_on", { ascending: true });
  if (error) throw error;
  const list = sessions ?? [];
  if (list.length === 0) return [];

  const rows = await fetchAllIn(
    list.map((s) => s.class_session_id),
    (slice) =>
      client
        .from("cohort_attendance")
        .select("class_session_id, status, attendance_id")
        .in("class_session_id", slice)
        .order("attendance_id"),
  );
  const countsBySession = new Map<string, AttendanceCounts>();
  for (const r of rows) {
    const c = countsBySession.get(r.class_session_id) ?? {
      ...EMPTY_ATTENDANCE_COUNTS,
    };
    c[r.status as AttendanceStatus] += 1;
    countsBySession.set(r.class_session_id, c);
  }

  return list.map((s) => {
    const counts = countsBySession.get(s.class_session_id) ?? {
      ...EMPTY_ATTENDANCE_COUNTS,
    };
    return {
      classSessionId: s.class_session_id,
      cohortId: s.cohort_id,
      sessionNo: s.session_no,
      heldOn: s.held_on,
      title: s.title,
      note: s.note,
      counts,
      recordedCount:
        counts.present + counts.late + counts.absent + counts.online + counts.excused,
    };
  });
}

export async function getClassSession(
  client: SupabaseClient<Database>,
  classSessionId: string,
): Promise<Omit<ClassSession, "counts" | "recordedCount"> | null> {
  const { data, error } = await client
    .from("cohort_class_sessions")
    .select("class_session_id, cohort_id, session_no, held_on, title, note")
    .eq("class_session_id", classSessionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    classSessionId: data.class_session_id,
    cohortId: data.cohort_id,
    sessionNo: data.session_no,
    heldOn: data.held_on,
    title: data.title,
    note: data.note,
  };
}

export async function createClassSession(
  client: SupabaseClient<Database>,
  input: {
    cohortId: string;
    sessionNo: number;
    heldOn: string;
    title: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { data, error } = await client
    .from("cohort_class_sessions")
    .insert({
      cohort_id: input.cohortId,
      session_no: input.sessionNo,
      held_on: input.heldOn,
      title: input.title,
      created_by: input.createdBy,
    })
    .select("class_session_id")
    .single();
  if (error) throw error;
  return data.class_session_id;
}

export async function updateClassSession(
  client: SupabaseClient<Database>,
  classSessionId: string,
  patch: { sessionNo?: number; heldOn?: string; title?: string | null },
): Promise<void> {
  const { error } = await client
    .from("cohort_class_sessions")
    .update({
      ...(patch.sessionNo !== undefined ? { session_no: patch.sessionNo } : {}),
      ...(patch.heldOn !== undefined ? { held_on: patch.heldOn } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
    })
    .eq("class_session_id", classSessionId);
  if (error) throw error;
}

export async function softDeleteClassSession(
  client: SupabaseClient<Database>,
  classSessionId: string,
): Promise<void> {
  const { error } = await client
    .from("cohort_class_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("class_session_id", classSessionId)
    .is("deleted_at", null);
  if (error) throw error;
}

// ── 출석 기록 ────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  profileId: string;
  status: AttendanceStatus;
  note: string | null;
}

export async function listSessionAttendance(
  client: SupabaseClient<Database>,
  classSessionId: string,
): Promise<AttendanceRecord[]> {
  const { data, error } = await client
    .from("cohort_attendance")
    .select("profile_id, status, note")
    .eq("class_session_id", classSessionId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    status: r.status as AttendanceStatus,
    note: r.note,
  }));
}

export async function saveSessionAttendance(
  client: SupabaseClient<Database>,
  classSessionId: string,
  entries: AttendanceRecord[],
  recordedBy: string,
): Promise<number> {
  if (entries.length === 0) return 0;
  const now = new Date().toISOString();
  const { error } = await client.from("cohort_attendance").upsert(
    entries.map((e) => ({
      class_session_id: classSessionId,
      profile_id: e.profileId,
      status: e.status,
      note: e.note,
      recorded_by: recordedBy,
      recorded_at: now,
    })),
    { onConflict: "class_session_id,profile_id" },
  );
  if (error) throw error;
  return entries.length;
}

// ── 요약 (학생별 누계) ──────────────────────────────────────────────────────

export interface StudentAttendanceSummary {
  profileId: string;
  counts: AttendanceCounts;
  recorded: number;
}

export async function getCohortAttendanceSummary(
  client: SupabaseClient<Database>,
  cohortId: string,
): Promise<Map<string, StudentAttendanceSummary>> {
  const { data: sessions, error } = await client
    .from("cohort_class_sessions")
    .select("class_session_id")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null);
  if (error) throw error;
  const sessionIds = (sessions ?? []).map((s) => s.class_session_id);
  const out = new Map<string, StudentAttendanceSummary>();
  if (sessionIds.length === 0) return out;

  const rows = await fetchAllIn(sessionIds, (slice) =>
    client
      .from("cohort_attendance")
      .select("profile_id, status, attendance_id")
      .in("class_session_id", slice)
      .order("attendance_id"),
  );
  for (const r of rows) {
    const cur = out.get(r.profile_id) ?? {
      profileId: r.profile_id,
      counts: { ...EMPTY_ATTENDANCE_COUNTS },
      recorded: 0,
    };
    cur.counts[r.status as AttendanceStatus] += 1;
    cur.recorded += 1;
    out.set(r.profile_id, cur);
  }
  return out;
}

// 학생 본인 — 내 출결 요약 (최근 회차 상태 포함). RLS: 회차 멤버 read + 출석 own read.
export interface MyAttendance {
  counts: AttendanceCounts;
  recorded: number;
  recent: Array<{
    sessionNo: number;
    heldOn: string;
    title: string | null;
    status: AttendanceStatus | null; // null = 미기록
  }>;
}

export async function getMyAttendance(
  client: SupabaseClient<Database>,
  userId: string,
  recentN = 6,
): Promise<MyAttendance | null> {
  // RLS 멤버 read — 내 반들의 회차만 조회된다.
  const { data: sessions, error } = await client
    .from("cohort_class_sessions")
    .select("class_session_id, session_no, held_on, title")
    .is("deleted_at", null)
    .order("held_on", { ascending: false })
    .order("session_no", { ascending: false })
    .limit(200);
  if (error) throw error;
  const list = sessions ?? [];
  if (list.length === 0) return null;

  const rows = await fetchAllIn(
    list.map((s) => s.class_session_id),
    (slice) =>
      client
        .from("cohort_attendance")
        .select("class_session_id, status, attendance_id")
        .eq("profile_id", userId)
        .in("class_session_id", slice)
        .order("attendance_id"),
  );
  const statusBySession = new Map(
    rows.map((r) => [r.class_session_id, r.status as AttendanceStatus]),
  );

  const counts = { ...EMPTY_ATTENDANCE_COUNTS };
  let recorded = 0;
  for (const s of rows) {
    counts[s.status as AttendanceStatus] += 1;
    recorded += 1;
  }
  return {
    counts,
    recorded,
    recent: list.slice(0, recentN).map((s) => ({
      sessionNo: s.session_no,
      heldOn: s.held_on,
      title: s.title,
      status: statusBySession.get(s.class_session_id) ?? null,
    })),
  };
}

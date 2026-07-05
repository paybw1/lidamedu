// 월간 개인 성적표(학습 리포트) 집계 — 반 학생별 한 달 치 학습량·출결·시험·과제·
// 취약 단원을 모아 인쇄용 화면(/admin/cohorts/:id/monthly-report)에 공급한다.
// 학생 명의 학습 데이터 교차 조회가 필요해 adminClient 로 집계 — 호출 loader 가
// staff + 반 소유권 게이트를 반드시 선행한다(출결 대장과 동일 원칙).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { fetchAllIn } from "~/core/lib/supa-batch.server";
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from "~/features/attendance/labels";
import { listCohortMembers } from "~/features/cohorts/queries.server";
import { scienceSubjectName } from "~/features/subjects/lib/science";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type {
  MonthlyAssignmentRow,
  MonthlyAttendanceRow,
  MonthlyReportData,
  MonthlyStudentReport,
  MonthlySubjectStat,
  MonthlyTestRow,
  MonthlyWeakNode,
} from "./monthly-report";

const KST_OFFSET_MS = 9 * 3600_000;
/** 취약 단원 판정 최소 표본(그 달 시도 수). */
const WEAK_MIN_ATTEMPTS = 4;
const WEAK_TOP_N = 3;

/** [전월 시작, 당월 시작, 익월 시작) — KST 자정 기준 UTC epoch(ms). */
function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    prevStart: Date.UTC(y, m - 2, 1) - KST_OFFSET_MS,
    start: Date.UTC(y, m - 1, 1) - KST_OFFSET_MS,
    end: Date.UTC(y, m, 1) - KST_OFFSET_MS,
  };
}

function kstDateStr(ts: number): string {
  return new Date(ts + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function subjectLabelOf(
  lawCode: string | null,
  scienceSubject: string | null,
): string {
  if (scienceSubject) return scienceSubjectName(scienceSubject);
  if (lawCode) {
    const meta = LAW_SUBJECTS[lawCode as LawSubjectSlug];
    if (meta) return meta.name;
  }
  return "기타";
}

interface AttemptRow {
  attempt_id: string;
  user_id: string;
  is_correct: boolean;
  attempted_at: string;
  problems: {
    primary_node_id: string | null;
    science_subject: string | null;
    laws: { law_code: string } | null;
  } | null;
}

export async function getMonthlyReport(
  cohortId: string,
  month: string,
  opts?: { onlyProfileId?: string },
): Promise<MonthlyReportData> {
  const admin = adminClient as SupabaseClient<Database>;
  const { prevStart, start, end } = monthBounds(month);
  const [y, m] = month.split("-").map(Number);
  const monthLabel = `${y}년 ${m}월`;

  const members = await listCohortMembers(admin, cohortId);
  const students = members
    .filter((mm) => mm.role === "student")
    .filter((mm) => !opts?.onlyProfileId || mm.profileId === opts.onlyProfileId);
  const studentIds = students.map((s) => s.profileId);
  if (studentIds.length === 0) {
    return { month, monthLabel, students: [] };
  }

  const prevStartIso = new Date(prevStart).toISOString();
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  // ── ① 풀이 시도(전월 포함 — 전월 대비 비교용) ──
  const attempts = await fetchAllIn<AttemptRow>(studentIds, (slice) =>
    admin
      .from("user_problem_attempts")
      .select(
        `attempt_id, user_id, is_correct, attempted_at,
         problems ( primary_node_id, science_subject, laws ( law_code ) )`,
      )
      .in("user_id", slice)
      .gte("attempted_at", prevStartIso)
      .lt("attempted_at", endIso)
      .order("attempt_id", { ascending: true }) as never,
  );

  // ── ② 출결 — 당월 회차 + 기록 ──
  const { data: sessions, error: sErr } = await admin
    .from("cohort_class_sessions")
    .select("class_session_id, session_no, held_on, title")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .gte("held_on", kstDateStr(start))
    .lt("held_on", kstDateStr(end))
    .order("session_no", { ascending: true });
  if (sErr) throw sErr;
  const sessionList = sessions ?? [];
  const attendanceRows =
    sessionList.length > 0
      ? await fetchAllIn(
          sessionList.map((s) => s.class_session_id),
          (slice) =>
            admin
              .from("cohort_attendance")
              .select("class_session_id, profile_id, status, attendance_id")
              .in("class_session_id", slice)
              .order("attendance_id", { ascending: true }),
        )
      : [];
  const attendanceByStudent = new Map<string, Map<string, AttendanceStatus>>();
  for (const r of attendanceRows) {
    if (!ATTENDANCE_STATUSES.includes(r.status as AttendanceStatus)) continue;
    let inner = attendanceByStudent.get(r.profile_id);
    if (!inner) {
      inner = new Map();
      attendanceByStudent.set(r.profile_id, inner);
    }
    inner.set(r.class_session_id, r.status as AttendanceStatus);
  }

  // ── ③ 오프라인 테스트(당월 생성분) + 결과 → 점수·석차·반 평균 ──
  const { data: tests, error: tErr } = await admin
    .from("offline_tests")
    .select("test_id, title, series_round_no, created_at")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });
  if (tErr) throw tErr;
  const testList = tests ?? [];
  const testResults =
    testList.length > 0
      ? await fetchAllIn(
          testList.map((t) => t.test_id),
          (slice) =>
            admin
              .from("offline_test_results")
              .select("test_id, user_id, status, score, max_score, result_id")
              .in("test_id", slice)
              .order("result_id", { ascending: true }),
        )
      : [];
  const takenByTest = new Map<
    string,
    Array<{ userId: string; score: number; maxScore: number | null }>
  >();
  for (const r of testResults) {
    if (r.status !== "taken" || r.score === null) continue;
    const arr = takenByTest.get(r.test_id) ?? [];
    arr.push({
      userId: r.user_id,
      score: Number(r.score),
      maxScore: r.max_score === null ? null : Number(r.max_score),
    });
    takenByTest.set(r.test_id, arr);
  }

  // ── ④ 과제(당월 마감) + 제출 현황 ──
  const { data: assignments, error: aErr } = await admin
    .from("assignments")
    .select("assignment_id, title, due_at, target_profile_id")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .gte("due_at", startIso)
    .lt("due_at", endIso)
    .order("due_at", { ascending: true });
  if (aErr) throw aErr;
  const assignmentList = assignments ?? [];
  const submissions =
    assignmentList.length > 0
      ? await fetchAllIn(
          assignmentList.map((a) => a.assignment_id),
          (slice) =>
            admin
              .from("assignment_submissions")
              .select(
                "assignment_id, user_id, status, completed_items, total_items, submission_id",
              )
              .in("assignment_id", slice)
              .order("submission_id", { ascending: true }),
        )
      : [];
  const submissionByKey = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) {
    submissionByKey.set(`${s.assignment_id}:${s.user_id}`, s);
  }

  // ── 취약 단원 라벨(당월 오답 집계에 등장한 노드만) ──
  const monthAttemptsAll = attempts.filter(
    (a) => new Date(a.attempted_at).getTime() >= start,
  );
  const nodeIds = [
    ...new Set(
      monthAttemptsAll
        .map((a) => a.problems?.primary_node_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const nodeMeta = new Map<string, { label: string; lawCode: string }>();
  if (nodeIds.length > 0) {
    const nodes = await fetchAllIn(nodeIds, (slice) =>
      admin
        .from("systematic_nodes")
        .select("node_id, display_label, law_code")
        .in("node_id", slice)
        .order("node_id", { ascending: true }),
    );
    for (const n of nodes) {
      nodeMeta.set(n.node_id, { label: n.display_label, lawCode: n.law_code });
    }
  }

  // ── 학생별 조립 ──
  const reports: MonthlyStudentReport[] = students.map((student) => {
    const mine = attempts.filter((a) => a.user_id === student.profileId);
    const mineMonth = mine.filter(
      (a) => new Date(a.attempted_at).getTime() >= start,
    );
    const minePrev = mine.filter(
      (a) => new Date(a.attempted_at).getTime() < start,
    );

    const correct = mineMonth.filter((a) => a.is_correct).length;
    const prevCorrect = minePrev.filter((a) => a.is_correct).length;
    const studyDays = new Set(
      mineMonth.map((a) => kstDateStr(new Date(a.attempted_at).getTime())),
    ).size;

    // 과목별
    const bySubjectMap = new Map<string, { attempts: number; correct: number }>();
    for (const a of mineMonth) {
      const label = subjectLabelOf(
        a.problems?.laws?.law_code ?? null,
        a.problems?.science_subject ?? null,
      );
      const b = bySubjectMap.get(label) ?? { attempts: 0, correct: 0 };
      b.attempts += 1;
      if (a.is_correct) b.correct += 1;
      bySubjectMap.set(label, b);
    }
    const bySubject: MonthlySubjectStat[] = [...bySubjectMap.entries()]
      .map(([label, b]) => ({
        label,
        attempts: b.attempts,
        correct: b.correct,
        accuracyPct: Math.round((b.correct / b.attempts) * 100),
      }))
      .sort((a, b) => b.attempts - a.attempts);

    // 취약 단원 — 당월 시도 표본 충분 + 정답률 낮은 순.
    const byNode = new Map<string, { attempts: number; correct: number }>();
    for (const a of mineMonth) {
      const nodeId = a.problems?.primary_node_id;
      if (!nodeId) continue;
      const b = byNode.get(nodeId) ?? { attempts: 0, correct: 0 };
      b.attempts += 1;
      if (a.is_correct) b.correct += 1;
      byNode.set(nodeId, b);
    }
    const weakNodes: MonthlyWeakNode[] = [...byNode.entries()]
      .filter(([, b]) => b.attempts >= WEAK_MIN_ATTEMPTS && b.correct < b.attempts)
      .map(([nodeId, b]) => {
        const meta = nodeMeta.get(nodeId);
        return {
          lawName: subjectLabelOf(meta?.lawCode ?? null, null),
          nodeLabel: meta?.label ?? "단원 미상",
          attempts: b.attempts,
          correct: b.correct,
          accuracyPct: Math.round((b.correct / b.attempts) * 100),
        };
      })
      .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempts - a.attempts)
      .slice(0, WEAK_TOP_N);

    // 출결
    const myAttendance = attendanceByStudent.get(student.profileId);
    const attendanceList: MonthlyAttendanceRow[] = sessionList.map((s) => ({
      sessionNo: s.session_no,
      heldOn: s.held_on,
      title: s.title,
      status: myAttendance?.get(s.class_session_id) ?? null,
    }));

    // 시험
    const testRows: MonthlyTestRow[] = [];
    for (const t of testList) {
      const taken = takenByTest.get(t.test_id) ?? [];
      const my = taken.find((v) => v.userId === student.profileId);
      if (!my) continue;
      const sorted = [...taken].sort((a, b) => b.score - a.score);
      const rank = sorted.findIndex((v) => v.score === my.score) + 1;
      const pcts = taken
        .filter((v) => v.maxScore && v.maxScore > 0)
        .map((v) => Math.round((v.score / v.maxScore!) * 100));
      testRows.push({
        title: t.title,
        roundNo: t.series_round_no,
        score: my.score,
        maxScore: my.maxScore,
        pct:
          my.maxScore && my.maxScore > 0
            ? Math.round((my.score / my.maxScore) * 100)
            : null,
        rank,
        taken: taken.length,
        avgPct:
          pcts.length > 0
            ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
            : null,
      });
    }

    // 과제 — 반 전체분 + 본인 개인분.
    const assignmentRows: MonthlyAssignmentRow[] = assignmentList
      .filter(
        (a) =>
          a.target_profile_id === null ||
          a.target_profile_id === student.profileId,
      )
      .map((a) => {
        const sub = submissionByKey.get(
          `${a.assignment_id}:${student.profileId}`,
        );
        return {
          title: a.title,
          dueAt: a.due_at,
          personal: a.target_profile_id !== null,
          completedItems: sub?.completed_items ?? 0,
          totalItems: sub?.total_items ?? 0,
          completed: sub?.status === "completed",
        };
      });

    return {
      profileId: student.profileId,
      name: student.name,
      study: {
        attempts: mineMonth.length,
        correct,
        accuracyPct:
          mineMonth.length > 0
            ? Math.round((correct / mineMonth.length) * 100)
            : null,
        studyDays,
        prevAttempts: minePrev.length,
        prevAccuracyPct:
          minePrev.length > 0
            ? Math.round((prevCorrect / minePrev.length) * 100)
            : null,
        bySubject,
      },
      attendance: attendanceList,
      tests: testRows,
      assignments: assignmentRows,
      weakNodes,
    };
  });

  return { month, monthLabel, students: reports };
}

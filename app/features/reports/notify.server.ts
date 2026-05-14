// 주간 학습 리포트 발송 — 학생 + 강사. (feat-7-022)
// 매주 월요일 새벽 cron 으로 호출. best-effort — 한 명 실패가 전체 중단 시키지 않음.

import { render } from "@react-email/render";

import adminClient from "~/core/lib/supa-admin-client.server";
import resendClient from "~/core/lib/resend-client.server";
import {
  getCohortAggregateStats,
  listCohortProgressSummary,
} from "~/features/admin/queries/student-progress.server";
import { listAssignmentsByCohort } from "~/features/assignments/queries.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  getDashboardKpis,
  getDailyStudyStats,
  getOverallProgress,
  getWeakAreas,
} from "~/features/study/queries.server";

import WeeklyReportStaff from "../../../transactional-emails/emails/weekly-report-staff";
import WeeklyReportStudent from "../../../transactional-emails/emails/weekly-report-student";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@lidamedu.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

interface DispatchResult {
  ok: number;
  failed: number;
  skipped: number;
  errors: Array<{ recipient: string; message: string }>;
}

function emptyResult(): DispatchResult {
  return { ok: 0, failed: 0, skipped: 0, errors: [] };
}

function weekRangeLabelKst(now: Date): string {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const day = k.getUTCDay();
  // 이번 주 월요일까지 후퇴
  const monday = new Date(k);
  monday.setUTCDate(k.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  // 지난 주 월요일 ~ 일요일 (방금 끝난 주)
  const lastMon = new Date(monday.getTime() - 7 * 86_400_000);
  const lastSun = new Date(monday.getTime() - 86_400_000);
  return `${lastMon.toISOString().slice(0, 10)} ~ ${lastSun.toISOString().slice(0, 10)}`;
}

async function getEmailById(userId: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function getProfileMeta(userId: string): Promise<{
  name: string;
  channels: string[];
} | null> {
  const { data } = await adminClient
    .from("profiles")
    .select("name, notify_channels")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name ?? "",
    channels: Array.isArray(data.notify_channels) ? data.notify_channels : [],
  };
}

// ─── 학생 리포트 ───

async function sendStudentReport(userId: string): Promise<{
  status: "ok" | "skipped" | "failed";
  reason?: string;
}> {
  const profile = await getProfileMeta(userId);
  if (!profile) return { status: "skipped", reason: "profile 없음" };
  if (!profile.channels.includes("email"))
    return { status: "skipped", reason: "email 채널 비활성" };

  const email = await getEmailById(userId);
  if (!email) return { status: "skipped", reason: "이메일 없음" };

  // 데이터 fetch
  const now = new Date();
  const [overall, kpis, weakAreas, daily, assignments] = await Promise.all([
    getOverallProgress(adminClient, userId),
    getDashboardKpis(adminClient, userId),
    getWeakAreas(adminClient, userId, 3),
    getDailyStudyStats(adminClient, userId, 14),
    listStudentAssignments(userId),
  ]);

  const pending = assignments
    .filter((a) => a.submission?.status !== "completed")
    .slice(0, 3);

  const html = await render(
    WeeklyReportStudent({
      link: `${APP_URL}/dashboard`,
      studentName: profile.name || "학습자",
      weekRangeLabel: weekRangeLabelKst(now),
      problemsAttempted: kpis.last7d.totalProblemsAttempted,
      accuracyPct: kpis.overallAccuracyPct,
      articlesViewed: overall.articles.visited,
      streakDays: daily.currentStreak,
      overallArticlesPct: overall.articles.pct,
      overallProblemsPct: overall.problems.pct,
      weakAreas: weakAreas.map((w) => ({
        label: `${w.lawCode} · ${w.bodySnippet.slice(0, 50)}`,
        hint:
          w.globalAccuracyPct !== null
            ? `글로벌 정답률 ${w.globalAccuracyPct}%`
            : null,
      })),
      pendingAssignments: pending.map((a) => ({
        title: a.title,
        dueAt: a.dueAt,
        completedItems: a.submission?.completedItems ?? 0,
        totalItems: a.submission?.totalItems ?? a.itemCount,
      })),
    }),
  );

  try {
    const res = await resendClient.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `[리담에듀] 주간 학습 리포트 · ${weekRangeLabelKst(now)}`,
      html,
    });
    if (res.error) return { status: "failed", reason: res.error.message };
    return { status: "ok" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── 강사 리포트 ───

async function sendStaffReport(
  staffUserId: string,
  cohortId: string,
  cohortName: string,
): Promise<{ status: "ok" | "skipped" | "failed"; reason?: string }> {
  const profile = await getProfileMeta(staffUserId);
  if (!profile) return { status: "skipped", reason: "profile 없음" };
  if (!profile.channels.includes("email"))
    return { status: "skipped", reason: "email 채널 비활성" };

  const email = await getEmailById(staffUserId);
  if (!email) return { status: "skipped", reason: "이메일 없음" };

  const now = new Date();
  const [agg, members, assignments] = await Promise.all([
    getCohortAggregateStats(cohortId),
    listCohortProgressSummary(cohortId),
    listAssignmentsByCohort(cohortId),
  ]);

  // 7일 이상 비활성 학생
  const SEVEN = 7 * 86_400_000;
  const inactive = members
    .filter((m) => {
      if (!m.lastActivityAt) return true;
      return now.getTime() - new Date(m.lastActivityAt).getTime() > SEVEN;
    })
    .map((m) => ({
      name: m.name,
      inactiveDays: m.lastActivityAt
        ? Math.floor(
            (now.getTime() - new Date(m.lastActivityAt).getTime()) / 86_400_000,
          )
        : 999,
    }))
    .sort((a, b) => b.inactiveDays - a.inactiveDays)
    .slice(0, 10);

  // 이번 주 마감/진행중 과제 top 5
  const recent = assignments
    .filter((a) => new Date(a.dueAt).getTime() > now.getTime() - 7 * 86_400_000)
    .slice(0, 5)
    .map((a) => ({
      title: a.title,
      dueAt: a.dueAt,
      completed: a.completedMembers ?? 0,
      total: a.totalMembers ?? 0,
    }));

  const html = await render(
    WeeklyReportStaff({
      link: `${APP_URL}/admin/cohorts/${cohortId}/progress`,
      staffName: profile.name || "선생님",
      cohortName,
      weekRangeLabel: weekRangeLabelKst(now),
      memberCount: agg.memberCount,
      active7dCount: agg.active7dCount,
      avgAccuracyPct: agg.avgAccuracyPct,
      avgProblemsAttempted: agg.avgProblemsAttempted,
      avgArticlesViewed: agg.avgArticlesViewed,
      inactiveStudents: inactive,
      assignments: recent,
    }),
  );

  try {
    const res = await resendClient.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `[리담에듀] ${cohortName} 주간 운영 리포트 · ${weekRangeLabelKst(now)}`,
      html,
    });
    if (res.error) return { status: "failed", reason: res.error.message };
    return { status: "ok" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── 발송 디스패처 ───

export async function dispatchWeeklyReports(): Promise<{
  student: DispatchResult;
  staff: DispatchResult;
}> {
  const student = emptyResult();
  const staff = emptyResult();

  // 1) 학생 발송 — cohort 멤버 distinct profile_id
  const { data: members } = await adminClient
    .from("cohort_members")
    .select("profile_id");
  const studentIds = Array.from(
    new Set((members ?? []).map((m) => m.profile_id)),
  );

  for (const userId of studentIds) {
    const res = await sendStudentReport(userId);
    if (res.status === "ok") student.ok += 1;
    else if (res.status === "skipped") student.skipped += 1;
    else {
      student.failed += 1;
      student.errors.push({
        recipient: userId,
        message: res.reason ?? "unknown",
      });
    }
  }

  // 2) 강사 발송 — cohort 별 owner 한 명
  const { data: cohorts } = await adminClient
    .from("cohorts")
    .select("cohort_id, name, owner_id, is_archived, deleted_at");
  const activeCohorts = (cohorts ?? []).filter(
    (c) => !c.is_archived && c.deleted_at === null,
  );
  for (const c of activeCohorts) {
    const res = await sendStaffReport(c.owner_id, c.cohort_id, c.name);
    if (res.status === "ok") staff.ok += 1;
    else if (res.status === "skipped") staff.skipped += 1;
    else {
      staff.failed += 1;
      staff.errors.push({
        recipient: `${c.name} (${c.owner_id})`,
        message: res.reason ?? "unknown",
      });
    }
  }

  return { student, staff };
}

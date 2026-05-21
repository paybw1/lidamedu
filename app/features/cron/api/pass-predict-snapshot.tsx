// 합격 진단 점수 일별 스냅샷 cron (feat-7-027).
// 외부 cron 일별 호출 → 모든 cohort 멤버 predict + upsert (snapshot_date PK).
// 같은 날 재실행 시 갱신 (덮어쓰기).

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import { predictPassScore } from "~/features/study/lib/pass-predict";
import {
  getDailyStudyStats,
  getDashboardKpis,
  getOverallProgress,
  getUserGsAveragePct,
} from "~/features/study/queries.server";

import type { Route } from "./+types/pass-predict-snapshot";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

async function snapshotForUser(userId: string): Promise<{
  status: "ok" | "failed";
  reason?: string;
}> {
  try {
    const [overall, kpis, daily, gs, assignments] = await Promise.all([
      getOverallProgress(adminClient, userId),
      getDashboardKpis(adminClient, userId),
      getDailyStudyStats(adminClient, userId, { daysBack: 14 }),
      getUserGsAveragePct(adminClient, userId),
      listStudentAssignments(userId),
    ]);
    const activeDaysLast14 = daily.days
      .slice(-14)
      .filter((d) => d.attemptCount > 0).length;
    const prediction = predictPassScore({
      overallArticlesPct: overall.articles.pct,
      overallProblemsPct: overall.problems.pct,
      overallAccuracyPct: kpis.overallAccuracyPct,
      gsAveragePct: gs,
      streakDays: daily.currentStreak,
      activeDaysLast14,
      pendingAssignmentsCount: assignments.filter(
        (a) => a.submission?.status !== "completed",
      ).length,
      totalAssignmentsCount: assignments.length,
    });
    const { error } = await adminClient.from("pass_prediction_snapshots").upsert(
      {
        user_id: userId,
        score: prediction.score,
        rating: prediction.rating,
        components: prediction.components as never,
        gs_average_pct: gs,
      },
      { onConflict: "user_id,snapshot_date" },
    );
    if (error) return { status: "failed", reason: error.message };
    return { status: "ok" };
  } catch (e) {
    return {
      status: "failed",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  // 대상: 활성 cohort 의 모든 멤버 distinct
  const { data: members } = await adminClient
    .from("cohort_members")
    .select("profile_id, cohorts!inner(is_archived, deleted_at)")
    .eq("cohorts.is_archived", false)
    .is("cohorts.deleted_at", null);
  const userIds = Array.from(
    new Set((members ?? []).map((m) => m.profile_id)),
  );

  let ok = 0;
  let failed = 0;
  const errors: Array<{ userId: string; message: string }> = [];
  for (const userId of userIds) {
    const res = await snapshotForUser(userId);
    if (res.status === "ok") ok += 1;
    else {
      failed += 1;
      errors.push({ userId, message: res.reason ?? "unknown" });
    }
  }
  return data({
    ok: true,
    summary: { processed: userIds.length, ok, failed },
    errors,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}

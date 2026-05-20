import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";
import {
  getAllSubjectsProgress,
  getDailyStudyStats,
  getDashboardKpis,
  getOverallProgress,
  getRecentActivity,
  getStudyAidCounts,
  getUserGsAveragePct,
  getWeakAreas,
} from "~/features/study/queries.server";
import { getStudyGoals } from "~/features/goals/queries.server";
import { listRecentCases } from "~/features/cases/queries.server";
import {
  getStaffRole,
  listRecentLawRevisions,
} from "~/features/laws/queries.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";
import { listTopBookmarks } from "~/features/annotations/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  LAW_SUBJECTS,
} from "~/features/subjects/lib/subjects";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import { getCurrentWeekTrack } from "~/features/curricula/queries.server";
import {
  getFailerBaseline,
  getPasserBenchmarks,
  getPasserLawAverages,
  listPasserSummaries,
} from "~/features/exam-results/analytics.server";
import { generateRecommendedActions } from "~/features/exam-results/recommendations";
import { predictPassScore } from "~/features/study/lib/pass-predict";

import type { Route } from "./+types/dashboard";
import {
  DashGrid,
  SectionBand,
  SpanCol,
  T,
} from "~/features/dashboard/lib/dash";
import {
  DashSidebar,
  DashTopbar,
} from "~/features/dashboard/components/dash-shell";
import {
  DashHeader,
  DashKpiStrip,
} from "~/features/dashboard/components/dash-header";
import {
  PendingAssignmentsCard,
  RecommendedActionsCard,
  WeekTrackCard,
} from "~/features/dashboard/components/dash-today";
import {
  PasserBenchmarkCard,
  PasserSummariesCard,
  PassPredictionCard,
} from "~/features/dashboard/components/dash-forecast";
import {
  OverallProgressCard,
  ScienceProgressCard,
  SubjectsProgressCard,
  TodayProgressCard,
} from "~/features/dashboard/components/dash-progress";
import {
  WeakNodesCard,
  WeakReviewCard,
} from "~/features/dashboard/components/dash-weak";
import {
  HeatmapCard,
  WeekBarsCard,
} from "~/features/dashboard/components/dash-activity";
import {
  BookmarksQuickCard,
  ReentryChipsCard,
} from "~/features/dashboard/components/dash-restudy";
import {
  RecentActivityCard,
  RecentCasesCard,
  RecentRevisionsCard,
} from "~/features/dashboard/components/dash-feed";
import { OxRecentCard } from "~/features/dashboard/components/dash-ox";
import { ReducedDashboard } from "~/features/dashboard/components/reduced-dashboard";
import { listMyOxSessions } from "~/features/mcq-packs/queries.server";
import { countMyOxWrongNoteItems } from "~/features/problems/queries.server";

export const meta: Route.MetaFunction = () => [{ title: "대시보드 | Lidam Patent Attorney Academy" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() || "사용자";
  // Onboarding 미완료 사용자는 wizard 로 redirect.
  // 단, 기존 설정 데이터가 있는 사용자(next_exam/consent/study_goals)는 자동 onboarded 처리 — 컬럼 도입 이전 가입자 대상.
  {
    const { data: prof } = await client
      .from("profiles")
      .select("onboarded_at, next_exam_year, analytics_consent_at")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (prof && prof.onboarded_at === null) {
      const { data: existingGoals } = await client
        .from("study_goals")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const hasAnySetup =
        prof.next_exam_year !== null ||
        prof.analytics_consent_at !== null ||
        existingGoals !== null;
      if (hasAnySetup) {
        await client
          .from("profiles")
          .update({ onboarded_at: new Date().toISOString() })
          .eq("profile_id", user.id);
      } else {
        throw redirect("/onboarding/welcome");
      }
    }
  }

  // 빈칸 학습 요약 + 문제풀이 KPI + 5과목 진도 + 84일 활동 병렬 조회.
  const [
    content,
    subject,
    period,
    recitation,
    kpis,
    subjectsProgress,
    dailyStats,
    goals,
    weakAreas,
  ] = await Promise.all([
    getUserBlankStats(client, user.id),
    getUserAutoBlankStats(client, user.id, "subject"),
    getUserAutoBlankStats(client, user.id, "period"),
    getUserRecitationStats(client, user.id),
    getDashboardKpis(client, user.id),
    getAllSubjectsProgress(
      client,
      user.id,
      LAW_SUBJECT_SLUGS.map((s) => ({
        slug: s,
        name: LAW_SUBJECTS[s].name,
      })),
    ),
    getDailyStudyStats(client, user.id, 84),
    getStudyGoals(client, user.id),
    getWeakAreas(client, user.id, 5),
  ]);
  const [
    recentRevisions,
    recentCases,
    overallProgress,
    recentActivity,
    topBookmarks,
    scienceProgress,
    weakNodes,
    studyAidCounts,
    studentAssignments,
    gsAveragePct,
    weekTrack,
    passerBenchmark,
    passerSummaries,
    passerLawAverages,
    failerBaseline,
    oxRecentSessions,
    oxWrongCount,
  ] = await Promise.all([
    listRecentLawRevisions(client, 5, user.id),
    listRecentCases(client, 5),
    getOverallProgress(client, user.id),
    getRecentActivity(client, user.id, 12),
    listTopBookmarks(client, user.id, 8),
    getAllScienceSubjectsProgress(client, user.id),
    getWeakNodes(client, user.id, [...LAW_SUBJECT_SLUGS], 4),
    getStudyAidCounts(client, user.id),
    listStudentAssignments(user.id),
    getUserGsAveragePct(client, user.id),
    getCurrentWeekTrack(user.id),
    getPasserBenchmarks(user.id),
    listPasserSummaries({ limit: 3 }),
    getPasserLawAverages(),
    getFailerBaseline(),
    // feat-10-006 — 대시보드 OX 카드용. 최신 10건 + 누적 응시 수 계산.
    listMyOxSessions(client, user.id, { limit: 50 }),
    countMyOxWrongNoteItems(client, user.id),
  ]);
  // 마감 임박 진행중 과제 top 3
  const pendingAssignments = studentAssignments
    .filter((a) => a.submission?.status !== "completed")
    .slice(0, 3);
  // 합격 진단 점수 (feat-7-024)
  const activeDaysLast14 = dailyStats.days
    .slice(-14)
    .filter((d) => d.attemptCount > 0).length;
  const passPrediction = predictPassScore({
    overallArticlesPct: overallProgress.articles.pct,
    overallProblemsPct: overallProgress.problems.pct,
    overallAccuracyPct: kpis.overallAccuracyPct,
    gsAveragePct,
    streakDays: dailyStats.currentStreak,
    activeDaysLast14,
    pendingAssignmentsCount: studentAssignments.filter(
      (a) => a.submission?.status !== "completed",
    ).length,
    totalAssignmentsCount: studentAssignments.length,
  });

  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  const summarize = (s: {
    totalAttempts: number;
    correctAttempts: number;
    weakBlanks: { length: number };
  }) => ({
    total: s.totalAttempts,
    correct: s.correctAttempts,
    accuracy:
      s.totalAttempts > 0
        ? Math.round((s.correctAttempts / s.totalAttempts) * 100)
        : 0,
    weak: s.weakBlanks.length,
  });

  const recommendedActions = generateRecommendedActions({
    benchmark: passerBenchmark,
    failerBaseline,
    passerLawAverages,
    weakAreas,
    weakNodes,
    pendingAssignments: pendingAssignments.map((a) => ({
      assignmentId: a.assignmentId,
      title: a.title,
      dueAt: a.dueAt,
      completedItems: a.submission?.completedItems ?? 0,
      totalItems: a.submission?.totalItems ?? a.itemCount,
    })),
    dailyStats: {
      currentStreak: dailyStats.currentStreak,
      totalActiveDays: dailyStats.totalActiveDays,
      avgHoursPerActiveDay: dailyStats.avgHoursPerActiveDay,
    },
    passPrediction,
    hasExamPlan: !!passerBenchmark?.hasPlan,
  });

  // 운영관리 메뉴는 staff(강사·관리자·원장)에게만 — 대시보드 사이드바 게이트.
  const isStaff = (await getStaffRole(client, user.id)) !== null;

  // feat-8-008 — 회원3(area_study_mgmt) 만 전체 분석 노출. staff 면제.
  const sub = await getActiveSubscription(client, user.id);
  const hasMgmt = isStaff || sub.features.includes("area_study_mgmt");
  const planCode = sub.planCode;

  return {
    isStaff,
    hasMgmt,
    planCode,
    weekTrack,
    passerBenchmark,
    passerSummaries,
    passerLawAverages,
    recommendedActions,
    pendingAssignments,
    passPrediction,
    user: {
      name,
      cohort: "27기 · 1차 준비",
    },
    blankSummary: {
      content: summarize(content),
      subject: summarize(subject),
      period: summarize(period),
      recitation: {
        total: recitation.totalAttempts,
        correct: recitation.completedAttempts,
        accuracy: Math.round(recitation.averageSimilarity * 100),
        weak: recitation.weakArticles.length,
      },
    },
    kpis,
    subjectsProgress,
    scienceProgress,
    dailyStats,
    goals,
    weakAreas,
    recentRevisions,
    recentCases,
    overallProgress,
    recentActivity,
    topBookmarks,
    weakNodes,
    studyAidCounts,
    todayLabel,
    oxRecent: {
      sessions: oxRecentSessions.slice(0, 10).map((s) => ({
        sessionId: s.sessionId,
        packId: s.packId,
        packTitle: s.packTitle,
        completedAt: s.completedAt,
        startedAt: s.startedAt,
        total: s.total,
        correct: s.correct,
        wrong: s.wrong,
      })),
      totalSessions: oxRecentSessions.length,
      wrongCount: oxWrongCount,
    },
  };
}

// ── 화면 유틸 ───────────────────────────────────────────────────────────────

const EXAM_DATE_FALLBACK_ISO = "2026-07-23";
const KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const HOUR_MS = 60 * 60 * 1000;

// ISO → 상대 시간 ("방금" / "N분 전" / "N시간 전" / "어제" / "N일 전" / 날짜)
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

// DifficultyBucket → 3단계
function bucketToDifficulty(
  bucket: string | null,
): "easy" | "medium" | "hard" {
  if (bucket === "very_easy" || bucket === "easy") return "easy";
  if (bucket === "hard" || bucket === "very_hard") return "hard";
  return "medium";
}

function lawName(code: string): string {
  const known = (LAW_SUBJECTS as Record<string, { name: string }>)[code];
  return known ? known.name : code;
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  // feat-8-008 — 회원3 미만(학습관리 권한 없음)은 축소판으로.
  if (!loaderData.hasMgmt) {
    return (
      <ReducedDashboard
        name={loaderData.user.name}
        planCode={loaderData.planCode}
      />
    );
  }
  const {
    user,
    kpis,
    dailyStats,
    goals,
    overallProgress,
    subjectsProgress,
    scienceProgress,
    weakAreas,
    weakNodes,
    passerLawAverages,
    recentActivity,
    recentRevisions,
    recentCases,
    topBookmarks,
    studyAidCounts,
    weekTrack,
    pendingAssignments,
    passPrediction,
    passerBenchmark,
    passerSummaries,
    recommendedActions,
    todayLabel,
  } = loaderData;

  // ── 헤더 / KPI ──
  const examDateIso = goals.examDate ?? EXAM_DATE_FALLBACK_ISO;
  const dailyTargetHours = goals.weeklyGoalHours / 7;
  const todayMs = dailyStats.days[dailyStats.days.length - 1]?.timeMs ?? 0;
  const todayHours = todayMs / HOUR_MS;

  // ── 이번 주 막대 (월=0 … 일=6) ──
  const todayKstIdx = (new Date().getDay() + 6) % 7;
  const weekSlice = dailyStats.days.slice(-(todayKstIdx + 1));
  const weekBars = KOREAN_WEEKDAYS.map((label, i) => ({
    label,
    hours: weekSlice[i] ? weekSlice[i].timeMs / HOUR_MS : 0,
    today: i === todayKstIdx,
  }));
  const weekTotalHours =
    weekSlice.reduce((s, d) => s + d.timeMs, 0) / HOUR_MS;

  // ── 히트맵 ──
  const heatmapDays = dailyStats.days.map((d) => ({
    date: d.date,
    level: Math.round(Math.min(1, d.timeMs / (90 * 60 * 1000)) * 4),
  }));

  // ── 약점 ──
  const weakRows = weakAreas.map((w) => ({
    problemId: w.problemId,
    lawCode: w.lawCode,
    lawName: lawName(w.lawCode),
    title: w.bodySnippet,
    difficulty: bucketToDifficulty(w.bucket),
    globalAccuracyPct: w.globalAccuracyPct,
  }));
  const weakNodeRows = weakNodes.map((n) => {
    const avg = (
      passerLawAverages as Record<
        string,
        { avgAttempts: number; avgAccuracyPct: number | null; learners: number }
      >
    )[n.lawCode];
    const hasAvg = avg !== undefined && avg.learners > 0;
    return {
      nodeId: n.nodeId,
      lawCode: n.lawCode,
      lawName: lawName(n.lawCode),
      name: n.displayLabel,
      accuracyPct: n.accuracyPct,
      myAttempts: n.problemAttempts,
      passerAvgAttempts: hasAvg ? avg.avgAttempts : null,
      passerAvgAccuracy: hasAvg ? avg.avgAccuracyPct : null,
    };
  });

  // ── 피드 ──
  const activityRows = recentActivity.map((a) => ({
    type: a.type,
    label: a.label,
    href: a.href,
    when: relTime(a.startedAt),
  }));
  const revisionRows = recentRevisions.map((r) => ({
    lawRevisionId: r.lawRevisionId,
    lawCode: r.lawCode,
    lawName: r.lawName,
    version: r.revisionNumber ?? "개정",
    date: r.effectiveDate ?? "",
    affectedCount: r.affectedArticleCount,
  }));
  const caseRows = recentCases.map((c) => ({
    caseId: c.caseId,
    lawSlug: c.subjectLaws[0] ?? "patent",
    cite: c.caseNumber,
    date: c.decidedAt,
    excerpt: c.summaryTitle ?? c.caseTitle,
  }));
  const bookmarkRows = topBookmarks.map((b) => ({
    targetType:
      b.targetType === "article" || b.targetType === "case"
        ? b.targetType
        : ("problem" as const),
    label: b.label,
    href: b.href,
    starLevel: b.starLevel,
  }));

  const hasToday =
    weekTrack !== null ||
    recommendedActions.length > 0 ||
    pendingAssignments.length > 0;
  const hasWeak = weakRows.length > 0 || weakNodeRows.length > 0;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: T.page,
        fontFamily: T.font,
        color: T.ink,
      }}
    >
      <DashSidebar isStaff={loaderData.isStaff} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <DashTopbar userName={user.name} inboxHref="/inbox" />
        <main
          style={{
            padding: "28px 32px 80px",
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
            minWidth: 0,
            flex: 1,
          }}
        >
          <DashHeader
            data={{
              userName: user.name,
              todayLabel,
              cohort: user.cohort,
              examDateIso,
              goalsConfigured: goals.examDate !== null,
              remainingHours: Math.max(0, dailyTargetHours - todayHours),
            }}
          />
          <DashKpiStrip
            data={{
              studyHours: kpis.totalProblemTimeMs / HOUR_MS,
              problems: kpis.totalProblemsAttempted,
              accuracy: kpis.overallAccuracyPct,
              deltaHours: kpis.last7d.totalProblemTimeMs / HOUR_MS,
              deltaProblems: kpis.last7d.totalProblemsAttempted,
              accuracyBase: kpis.totalProblemsAttempted,
            }}
          />

          {hasToday ? (
            <>
              <SectionBand eyebrow="TODAY · 오늘 할 일" />
              <DashGrid>
                {weekTrack !== null ? (
                  <SpanCol span={3}>
                    <WeekTrackCard track={weekTrack} />
                  </SpanCol>
                ) : null}
                {recommendedActions.length > 0 ? (
                  <SpanCol span={3}>
                    <RecommendedActionsCard actions={recommendedActions} />
                  </SpanCol>
                ) : null}
                {pendingAssignments.length > 0 ? (
                  <SpanCol span={6}>
                    <PendingAssignmentsCard assignments={pendingAssignments} />
                  </SpanCol>
                ) : null}
              </DashGrid>
            </>
          ) : null}

          <SectionBand eyebrow="PASS FORECAST · 합격 진단" />
          <DashGrid>
            <SpanCol span={6}>
              <PassPredictionCard prediction={passPrediction} />
            </SpanCol>
            {passerBenchmark !== null ? (
              <SpanCol span={4}>
                <PasserBenchmarkCard benchmark={passerBenchmark} />
              </SpanCol>
            ) : null}
            {passerSummaries.length > 0 ? (
              <SpanCol span={2}>
                <PasserSummariesCard summaries={passerSummaries} />
              </SpanCol>
            ) : null}
          </DashGrid>

          <SectionBand eyebrow="PROGRESS · 진도" />
          <DashGrid>
            <SpanCol span={3}>
              <OverallProgressCard overall={overallProgress} />
            </SpanCol>
            <SpanCol span={3}>
              <TodayProgressCard
                data={{
                  todayHours,
                  weekTotalHours,
                  weeklyTarget: goals.weeklyGoalHours,
                  streak: dailyStats.currentStreak,
                  activeDays: dailyStats.totalActiveDays,
                  avgDailyHours: dailyStats.avgHoursPerActiveDay,
                }}
              />
            </SpanCol>
            <SpanCol span={3}>
              <SubjectsProgressCard subjects={subjectsProgress} />
            </SpanCol>
            <SpanCol span={3}>
              <ScienceProgressCard science={scienceProgress} />
            </SpanCol>
          </DashGrid>

          {hasWeak ? (
            <>
              <SectionBand eyebrow="WEAK SPOTS · 약점" />
              <DashGrid>
                {weakRows.length > 0 ? (
                  <SpanCol span={4}>
                    <WeakReviewCard areas={weakRows} />
                  </SpanCol>
                ) : null}
                {weakNodeRows.length > 0 ? (
                  <SpanCol span={2}>
                    <WeakNodesCard nodes={weakNodeRows} />
                  </SpanCol>
                ) : null}
              </DashGrid>
            </>
          ) : null}

          <SectionBand eyebrow="ACTIVITY · 학습 패턴" />
          <DashGrid>
            <SpanCol span={4}>
              <HeatmapCard
                days={heatmapDays}
                activeDays={dailyStats.totalActiveDays}
                avgHours={dailyStats.avgHoursPerActiveDay}
              />
            </SpanCol>
            <SpanCol span={2}>
              <WeekBarsCard bars={weekBars} />
            </SpanCol>
          </DashGrid>

          <SectionBand eyebrow="RE-STUDY · 재학습 진입" />
          <DashGrid>
            <SpanCol span={2}>
              <ReentryChipsCard counts={studyAidCounts} />
            </SpanCol>
            <SpanCol span={4}>
              <BookmarksQuickCard bookmarks={bookmarkRows} />
            </SpanCol>
            <SpanCol span={6}>
              <OxRecentCard data={loaderData.oxRecent} />
            </SpanCol>
          </DashGrid>

          <SectionBand eyebrow="ACTIVITY FEED · 최근 흐름" />
          <DashGrid>
            <SpanCol span={3}>
              <RecentActivityCard items={activityRows} />
            </SpanCol>
            <SpanCol span={3}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <RecentRevisionsCard items={revisionRows} />
                <RecentCasesCard items={caseRows} />
              </div>
            </SpanCol>
          </DashGrid>
        </main>
      </div>

      <style>{`
        @media (max-width: 1080px) {
          .dash-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .dash-grid > [data-span] { grid-column: span 3 !important; }
        }
        @media (max-width: 720px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-grid > [data-span] { grid-column: span 1 !important; }
          .dash-header { grid-template-columns: 1fr !important; }
          .dash-kpi { grid-template-columns: 1fr !important; }
          .dash-sidebar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

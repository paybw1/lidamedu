import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { Link, redirect } from "react-router";

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
import { isPasserBenchmarkEnabled } from "~/features/exam-results/passer-benchmark-gate.server";
import { hasPoolConsent } from "~/features/exam-results/queries.server";
import { ConsentSection } from "~/features/exam-results/components/consent-section";
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
  DashHeader,
  DashKpiStrip,
} from "~/features/dashboard/components/dash-header";
import { DashKpiStripV2 } from "~/features/dashboard/components/dash-kpi-strip-v2";
import {
  PendingAssignmentsCard,
  RecommendedActionsCard,
  WeekTrackCard,
} from "~/features/dashboard/components/dash-today";
import {
  PassCriterionAnnouncementCard,
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
import { AiQnaRecentCard } from "~/features/dashboard/components/dash-ai-qna";
import { OxRecentCard } from "~/features/dashboard/components/dash-ox";
import { ReducedDashboard } from "~/features/dashboard/components/reduced-dashboard";
import { TodayEntryCard } from "~/features/dashboard/components/dash-today-entry";
import { getTodaySummary } from "~/features/study/today-summary.server";
import { listMyConversations } from "~/features/ai-qna/conversations.server";
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

  // pass-predict 차수 분기용 — next_exam_round 조회. null = 1차 default.
  const { data: predictProfile } = await client
    .from("profiles")
    .select("next_exam_round, my_analysis_consent_at, pool_consent_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  const userExamRound = (predictProfile?.next_exam_round ?? null) as
    | "first"
    | "second"
    | null;

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
    getDailyStudyStats(client, user.id, { daysBack: 84 }),
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
    todaySummary,
    passerBundle,
    oxRecentSessions,
    oxWrongCount,
    aiConversations,
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
    // 오늘 입구 카드 + [오늘] 본문 공유 데이터.
    getTodaySummary(client, user.id),
    // 학생 화면 — 합성 합격자 절대 노출 금지. excludeSynthetic:true 강제.
    // 게이트 OFF (실 합격자 < 임계값) 시 합격자 비교 자체를 비활성화.
    isPasserBenchmarkEnabled().then(async (gate) => {
      if (!gate.enabled) {
        return {
          gate,
          benchmark: null,
          summaries: [] as Awaited<ReturnType<typeof listPasserSummaries>>,
          lawAverages: {} as Awaited<ReturnType<typeof getPasserLawAverages>>,
          failerBaseline: null as Awaited<ReturnType<typeof getFailerBaseline>>,
        };
      }
      // viewer-B 게이트(feat-8-026b) — 개인 "비교"(합격자/실패자 평균 대비)는
      // 요청자가 풀(B)에 동의했을 때만. 후기(summaries)는 익명·공개라 B 불요 → 항상 노출.
      const [canCompare, summaries] = await Promise.all([
        hasPoolConsent(client, user.id),
        listPasserSummaries({ limit: 3, excludeSynthetic: true }),
      ]);
      if (!canCompare) {
        return {
          gate,
          benchmark: null,
          summaries,
          lawAverages: {} as Awaited<ReturnType<typeof getPasserLawAverages>>,
          failerBaseline: null as Awaited<ReturnType<typeof getFailerBaseline>>,
        };
      }
      const [benchmark, lawAverages, failerBaseline] = await Promise.all([
        getPasserBenchmarks(user.id, { excludeSynthetic: true }),
        getPasserLawAverages({ excludeSynthetic: true }),
        getFailerBaseline({ excludeSynthetic: true }),
      ]);
      return { gate, benchmark, summaries, lawAverages, failerBaseline };
    }),
    // feat-10-006 — 대시보드 OX 카드용. 최신 10건 + 누적 응시 수 계산.
    listMyOxSessions(client, user.id, { limit: 50 }),
    countMyOxWrongNoteItems(client, user.id),
    // feat-9-004 — 대시보드 AI Q&A 카드용. last 3 대화.
    listMyConversations(client, user.id, 3),
  ]);
  // A3 게이트 — 합격자 비교 OFF 시 4종 값 모두 null/[]. 컴포넌트 단에서 합격 기준 안내 카드로 대체.
  const passerGate = passerBundle.gate;
  const passerBenchmark = passerBundle.benchmark;
  const passerSummaries = passerBundle.summaries;
  const passerLawAverages = passerBundle.lawAverages;
  const failerBaseline = passerBundle.failerBaseline;
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
    examRound: userExamRound,
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
    // feat-8-026b — 선택 동의(A/B) 토글을 대시보드에서(응시 결과에서 이전).
    myAnalysisConsentAt: predictProfile?.my_analysis_consent_at ?? null,
    poolConsentAt: predictProfile?.pool_consent_at ?? null,
    weekTrack,
    todaySummary,
    passerGate,
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
    aiConversations: aiConversations.map((c) => ({
      conversationId: c.conversationId,
      title: c.title,
      lastSnippet: c.lastSnippet,
      updatedAt: c.updatedAt,
      messageCount: c.messageCount,
    })),
  };
}

// ── 화면 유틸 ───────────────────────────────────────────────────────────────

const EXAM_DATE_FALLBACK_ISO = "2026-07-23";
const KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const HOUR_MS = 60 * 60 * 1000;

// ISO → 상대 시간 ("방금" / "N분 전" / "N시간 전" / "어제" / "N일 전" / 날짜)
/* ── feat-2-009 — 오늘의 학습 메뉴 진입점 배너 ───────────────────── */

function DailyMenuBanner() {
  return (
    <Link
      to="/study/today"
      viewTransition
      className="border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10 group mb-4 flex items-center gap-3 rounded-xl border p-4 transition-colors"
    >
      <span className="bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-lg">
        <SparklesIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-bold">오늘의 학습 메뉴</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          본인 약점·미열람·진도 데이터를 합성한 자동 추천 5개. 오늘 어디부터
          시작할지 정해드립니다.
        </p>
      </div>
      <ArrowRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

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
    todaySummary,
    pendingAssignments,
    passPrediction,
    passerGate,
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
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
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

          {/* 최상단 — 오늘로 가는 입구. 통계가 아니라 오늘 할 일 요약 + 큰 진입 버튼.
             ★ Notion·Linear 톤 시범 리디자인 — 학생 공용 프리미티브 사용. */}
          <div className="mb-8">
            <TodayEntryCard summary={todaySummary} />
          </div>

          {/* 그 아래 — 내 위치 조망 (누적·추세). KPI 부터 시작. */}
          <div className="mb-6">
            <DashKpiStripV2
              data={{
                studyHours: kpis.totalProblemTimeMs / HOUR_MS,
                problems: kpis.totalProblemsAttempted,
                accuracy: kpis.overallAccuracyPct,
                deltaHours: kpis.last7d.totalProblemTimeMs / HOUR_MS,
                deltaProblems: kpis.last7d.totalProblemsAttempted,
                accuracyBase: kpis.totalProblemsAttempted,
              }}
            />
          </div>

          {/* RecommendedActionsCard / WeekTrackCard / PendingAssignmentsCard 는
             [오늘] 본문 (/study/today) 에서 단일 흐름으로 표시. 대시보드 입구는
             요약+버튼까지만 (지시서 §1-A 경계 규칙). 합격선 컨설팅 액션은 아래
             WEAK SPOTS 섹션에 합쳐 노출. */}

          <SectionBand eyebrow="PASS FORECAST · 합격 예측" />
          <DashGrid>
            <SpanCol span={6}>
              <PassPredictionCard prediction={passPrediction} />
            </SpanCol>
            {!passerGate.enabled ? (
              // 1년차 — 합격자 비교 게이트 OFF. 합격 기준 안내 카드로 대체.
              <SpanCol span={6}>
                <PassCriterionAnnouncementCard gate={passerGate} />
              </SpanCol>
            ) : (
              <>
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
              </>
            )}
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

          {hasWeak || recommendedActions.length > 0 ? (
            <>
              <SectionBand eyebrow="WEAK SPOTS · 약점 → 행동 다리" />
              <DashGrid>
                {weakRows.length > 0 ? (
                  <SpanCol span={2}>
                    <WeakReviewCard areas={weakRows} />
                  </SpanCol>
                ) : null}
                {weakNodeRows.length > 0 ? (
                  <SpanCol span={2}>
                    <WeakNodesCard nodes={weakNodeRows} />
                  </SpanCol>
                ) : null}
                {recommendedActions.length > 0 ? (
                  <SpanCol span={2}>
                    <RecommendedActionsCard actions={recommendedActions} />
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
            <SpanCol span={3}>
              <OxRecentCard data={loaderData.oxRecent} />
            </SpanCol>
            <SpanCol span={3}>
              <AiQnaRecentCard conversations={loaderData.aiConversations} />
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

          <SectionBand eyebrow="DATA CONSENT · 데이터 활용 동의" />
          <DashGrid>
            <SpanCol span={6}>
              <ConsentSection
                myAnalysisConsentedAt={loaderData.myAnalysisConsentAt}
                poolConsentedAt={loaderData.poolConsentAt}
              />
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

import type { Route } from "./+types/dashboard";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { listThreads } from "~/features/qna/queries.server";
import { listTopBookmarks } from "~/features/annotations/queries.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import { listRecentCases } from "~/features/cases/queries.server";
import { getCurrentWeekTrack } from "~/features/curricula/queries.server";
import {
  HeatmapCard,
  WeekBarsCard,
} from "~/features/dashboard/components/dash-activity";
import { QnaRecentCard } from "~/features/dashboard/components/dash-qna";
import {
  RecentActivityCard,
  RecentCasesCard,
  RecentRevisionsCard,
} from "~/features/dashboard/components/dash-feed";
import {
  PassCriterionAnnouncementCard,
  PassPredictionCard,
  PasserBenchmarkCard,
  PasserSummariesCard,
} from "~/features/dashboard/components/dash-forecast";
import {
  DashHeader,
  DashKpiStrip,
} from "~/features/dashboard/components/dash-header";
import {
  GrowthStripCard,
  type GrowthStripData,
} from "~/features/dashboard/components/dash-growth";
import { DashKpiStripV2 } from "~/features/dashboard/components/dash-kpi-strip-v2";
import { OxRecentCard } from "~/features/dashboard/components/dash-ox";
import {
  OverallProgressCard,
  ScienceProgressCard,
  SubjectsProgressCard,
  TodayProgressCard,
} from "~/features/dashboard/components/dash-progress";
import {
  BookmarksQuickCard,
  ReentryChipsCard,
} from "~/features/dashboard/components/dash-restudy";
import {
  PendingAssignmentsCard,
  RecommendedActionsCard,
  WeekTrackCard,
} from "~/features/dashboard/components/dash-today";
import { TodayEntryCard } from "~/features/dashboard/components/dash-today-entry";
import {
  WeakNodesCard,
  WeakReviewCard,
} from "~/features/dashboard/components/dash-weak";
import { InstructorAccessNotice } from "~/features/dashboard/components/instructor-access-notice";
import { TrialNoticeBanner } from "~/features/dashboard/components/trial-notice-banner";
import { ReducedDashboard } from "~/features/dashboard/components/reduced-dashboard";
import { StudentInputHub } from "~/features/dashboard/components/student-input-hub";
import {
  DashGrid,
  SectionBand,
  SpanCol,
  T,
} from "~/features/dashboard/lib/dash";
import {
  getFailerBaseline,
  getPasserBenchmarks,
  getPasserLawAverages,
  listPasserSummaries,
} from "~/features/exam-results/analytics.server";
import { EXAM_ROUND_LABEL } from "~/features/exam-results/labels";
import { isPasserBenchmarkEnabled } from "~/features/exam-results/passer-benchmark-gate.server";
import { hasPoolConsent } from "~/features/exam-results/queries.server";
import { generateRecommendedActions } from "~/features/exam-results/recommendations";
import {
  getStudyGoals,
  listExamPlanOptions,
} from "~/features/goals/queries.server";
import {
  getStaffRole,
  listRecentLawRevisions,
} from "~/features/laws/queries.server";
import { listMyOxSessions } from "~/features/mcq-packs/queries.server";
import { countMyOxWrongNoteItems } from "~/features/problems/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";
import { getGamificationSummary } from "~/features/study/gamification.server";
import { summarizeMastery } from "~/features/study/lib/mastery";
import { predictPassScore } from "~/features/study/lib/pass-predict";
import { getNodeMastery } from "~/features/study/mastery.server";
import { upsertPassPredictionSnapshot } from "~/features/study/pass-predict-snapshot.server";
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
import { getTodaySummary } from "~/features/study/today-summary.server";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import { getMembershipAccess } from "~/features/subscriptions/membership.server";
import { getActiveSubscription } from "~/features/subscriptions/queries.server";
import { notifyTrialExpiryIfDue } from "~/features/subscriptions/trial.server";

export const meta: Route.MetaFunction = () => [
  { title: "대시보드 | 리담변리사학원" },
];

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
    .select("next_exam_round, next_exam_year, my_analysis_consent_at, pool_consent_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  const userExamRound = (predictProfile?.next_exam_round ?? null) as
    | "first"
    | "second"
    | null;
  const userExamYear = predictProfile?.next_exam_year ?? null;

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
  // 응시 시험 옵션(내 정보 설정 목표 블록) — 운영자 관리 시험 일정.
  const examOptions = await listExamPlanOptions(client);
  const selectedPlan =
    userExamRound && userExamYear ? `${userExamYear}:${userExamRound}` : null;
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
    recentQnaThreads,
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
      // 요청자가 풀(B)에 동의했을 때만. 수기(summaries)는 익명·공개라 B 불요 → 항상 노출.
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
    // 대시보드 "최근 Q&A" 카드용 — 내가 올린 질문 last 3.
    listThreads(client, user.id, { scope: "asked-by-me", limit: 3 }),
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

  // feat-2-008 #6 — 합격예측 추이 크론 미가동 대안: 방문 시 오늘자 스냅샷을 비차단
  // 기록(멱등 upsert). adminClient = 스냅샷 테이블 RLS 우회(크론과 동일 경로).
  runAfterResponse(
    upsertPassPredictionSnapshot(
      adminClient,
      user.id,
      passPrediction,
      gsAveragePct,
    ),
  );

  // feat-2-027 — 성장 요약 스트립(레벨·마스터 단원·스트릭·주간 공부량).
  // A(내 분석) 동의 시만 산출·노출. 상세·코호트 비교는 /study/stats.
  // ★대시보드는 읽기 미러 → persist:false — 영속(레벨업 알림)은 학습현황이 소유.
  const myAnalysisOn = predictProfile?.my_analysis_consent_at != null;
  let growthStrip: GrowthStripData | null = null;
  if (myAnalysisOn) {
    const nodeMastery = await getNodeMastery(client, user.id, [
      ...LAW_SUBJECT_SLUGS,
    ]);
    const masteredCount = summarizeMastery(
      nodeMastery.map((r) => r.stage),
    ).mastered;
    const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const g = await getGamificationSummary(
      client,
      user.id,
      todayYmd,
      masteredCount,
      { persist: false },
    );
    growthStrip = {
      levelName: g.level.name,
      levelNumber: g.level.levelNumber,
      masteredCount: g.level.masteredCount,
      toNext: g.level.toNext,
      nextName: g.level.nextName,
      thisWeekStudyMs: g.thisWeekStudyMs,
      studyDeltaPct: g.studyDeltaPct,
    };
  }

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

  // feat-8-027 — 체험(가입 15일) 안내 배너 + 만료 임박 인박스 공지(지연 트리거·1회).
  const access = await getMembershipAccess(client, user.id);
  const trial =
    access.grade === "trial" && access.trialEndsAt
      ? {
          endsAt: access.trialEndsAt,
          daysLeft: Math.max(
            0,
            Math.ceil(
              (new Date(access.trialEndsAt).getTime() - Date.now()) /
                86_400_000,
            ),
          ),
        }
      : null;
  if (trial) runAfterResponse(notifyTrialExpiryIfDue(user.id));

  return {
    isStaff,
    hasMgmt,
    planCode,
    trial,
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
    growthStrip,
    user: {
      name,
      // 차수는 profiles.next_exam_round 실데이터(feat-2-025); 기수는 활성 트랙 있을 때만.
      cohort: weekTrack
        ? `${weekTrack.cohortName} · ${EXAM_ROUND_LABEL[userExamRound ?? "first"]} 준비`
        : `${EXAM_ROUND_LABEL[userExamRound ?? "first"]} 준비`,
    },
    examRound: userExamRound,
    examOptions,
    selectedPlan,
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
    recentQna: recentQnaThreads.map((t) => ({
      threadId: t.threadId,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
    })),
  };
}

// ── 화면 유틸 ───────────────────────────────────────────────────────────────

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
function bucketToDifficulty(bucket: string | null): "easy" | "medium" | "hard" {
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
        isCohortMember={loaderData.todaySummary.assignments.isCohortMember}
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
    examRound,
  } = loaderData;

  // ── 헤더 / KPI ──
  // 시험일 미설정이면 D-day 를 추정하지 않는다 — 가짜 D-day 대신 설정 안내(feat-2-025 Phase 3).
  const examDateIso = goals.examDate;
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
  const weekTotalHours = weekSlice.reduce((s, d) => s + d.timeMs, 0) / HOUR_MS;

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
              examRound,
              goalsConfigured: goals.examDate !== null,
              remainingHours: Math.max(0, dailyTargetHours - todayHours),
            }}
          />

          {/* feat-8-027 — 체험(가입 15일) 안내 배너. 특허법만 무료·만료 후 무료회원 전환 사전공지. */}
          {loaderData.trial ? (
            <TrialNoticeBanner daysLeft={loaderData.trial.daysLeft} />
          ) : null}

          {/* 내 정보 설정 허브 — 목표·시험결과·동의를 한 Sheet 3블록으로(각 독립 저장).
             차수·목표 모두 미설정이면 첫 진입에 자동 오픈(온보딩성 넛지). */}
          <div className="-mt-2 mb-6 flex justify-end">
            <StudentInputHub
              goals={goals}
              examRound={examRound}
              examOptions={loaderData.examOptions}
              selectedPlan={loaderData.selectedPlan}
              myAnalysisConsentAt={loaderData.myAnalysisConsentAt}
              poolConsentAt={loaderData.poolConsentAt}
              autoOpen={examRound === null && !goals.examDate}
            />
          </div>

          {/* feat-7-040 — 강사 열람 투명성 고지(약관 제7조 ⑤). 지도형 과정(cohort) 멤버에게만. */}
          {todaySummary.assignments.isCohortMember ? (
            <InstructorAccessNotice />
          ) : null}

          {/* 최상단 — 오늘로 가는 입구. 통계가 아니라 오늘 할 일 요약 + 큰 진입 버튼.
             ★ Notion·Linear 톤 시범 리디자인 — 학생 공용 프리미티브 사용.
             종합반(cohort) + 임박 과제 있으면 과제를 오늘의 학습 오른쪽 별도 카드로 분리. */}
          {todaySummary.assignments.isCohortMember &&
          pendingAssignments.length > 0 ? (
            <div className="mb-8">
              <DashGrid>
                <SpanCol span={4}>
                  <TodayEntryCard summary={todaySummary} hideAssignmentChip />
                </SpanCol>
                <SpanCol span={2}>
                  <PendingAssignmentsCard
                    assignments={pendingAssignments.map((a) => ({
                      assignmentId: a.assignmentId,
                      title: a.title,
                      dueAt: a.dueAt,
                      itemCount: a.itemCount,
                      submission: a.submission
                        ? {
                            completedItems: a.submission.completedItems,
                            totalItems: a.submission.totalItems,
                          }
                        : null,
                    }))}
                  />
                </SpanCol>
              </DashGrid>
            </div>
          ) : (
            <div className="mb-8">
              <TodayEntryCard summary={todaySummary} />
            </div>
          )}

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

          {/* GROWTH · 성장 — 학습현황(게임화)의 압축 미러. A(내 분석) 동의 시만.
             레벨·마스터 단원·연속 학습·주간 공부량. 상세·코호트 비교는 /study/stats. */}
          {loaderData.growthStrip ? (
            <>
              <SectionBand
                eyebrow="GROWTH · 성장"
                right={
                  <Link
                    to="/study/stats"
                    style={{
                      font: "600 11px/1 Pretendard, sans-serif",
                      color: T.link,
                      textDecoration: "none",
                    }}
                  >
                    학습현황 자세히 →
                  </Link>
                }
              />
              <div className="mb-2">
                <GrowthStripCard g={loaderData.growthStrip} />
              </div>
            </>
          ) : null}

          {/* RecommendedActionsCard / WeekTrackCard / PendingAssignmentsCard 는
             [오늘] 본문 (/study/today) 에서 단일 흐름으로 표시. 대시보드 입구는
             요약+버튼까지만 (지시서 §1-A 경계 규칙). 합격선 컨설팅 액션은 아래
             WEAK SPOTS 섹션에 합쳐 노출. */}

          <SectionBand eyebrow="PASS FORECAST · 합격 예측" />
          <DashGrid>
            {!passerGate.enabled ? (
              // 합격자 데이터 게이트 OFF — 합격 예측은 합격자 기준이 없어 신뢰가 어렵다.
              // 예측 카드는 숨기고 공식 합격선 안내만. 실 합격자 ≥ 임계 누적 시 자동 노출.
              // (예측 점수·스냅샷은 runAfterResponse 로 계속 기록 → 데이터 준비되면 그대로 표시)
              <SpanCol span={6}>
                <PassCriterionAnnouncementCard gate={passerGate} />
              </SpanCol>
            ) : (
              <>
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
            <SpanCol span={examRound === "second" ? 6 : 3}>
              <SubjectsProgressCard
                subjects={subjectsProgress}
                examRound={examRound}
              />
            </SpanCol>
            {/* 자연과학은 1차 전용 — 2차 목표면 숨기고 법률 카드가 행을 채운다. */}
            {examRound !== "second" ? (
              <SpanCol span={3}>
                <ScienceProgressCard science={scienceProgress} />
              </SpanCol>
            ) : null}
          </DashGrid>

          {hasWeak || recommendedActions.length > 0 ? (
            <>
              <SectionBand eyebrow="WEAK SPOTS · 약점 → 행동 다리" />
              <DashGrid>
                {[
                  weakRows.length > 0 ? (
                    <WeakReviewCard areas={weakRows} />
                  ) : null,
                  weakNodeRows.length > 0 ? (
                    <WeakNodesCard nodes={weakNodeRows} />
                  ) : null,
                  recommendedActions.length > 0 ? (
                    <RecommendedActionsCard actions={recommendedActions} />
                  ) : null,
                ]
                  .filter(Boolean)
                  // 표시되는 카드 수에 맞춰 span 분배 → 항상 6칸(풀 너비) 채움(1=6·2=3·3=2).
                  .map((card, i, arr) => (
                    <SpanCol
                      key={i}
                      span={arr.length === 1 ? 6 : arr.length === 2 ? 3 : 2}
                    >
                      {card}
                    </SpanCol>
                  ))}
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
              <QnaRecentCard threads={loaderData.recentQna} />
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

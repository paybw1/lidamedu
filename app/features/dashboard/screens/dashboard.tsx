import {
  FlameIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
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
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
} from "~/features/study/lib/difficulty";
import { getStudyGoals } from "~/features/goals/queries.server";
import { listRecentCases } from "~/features/cases/queries.server";
import { listRecentLawRevisions } from "~/features/laws/queries.server";
import { listTopBookmarks } from "~/features/annotations/queries.server";
import { LAW_SUBJECT_SLUGS, LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import { getWeakNodes } from "~/features/subjects/lib/weak-nodes.server";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  predictPassScore,
  type PassPrediction,
} from "~/features/study/lib/pass-predict";

import type { Route } from "./+types/dashboard";
import CozyCard from "../components/cozy-card";
import CozyHeatmap from "../components/cozy-heatmap";
import CozyProgressDonut from "../components/cozy-progress-donut";
import CozySidebar from "../components/cozy-sidebar";
import CozyStatChip from "../components/cozy-stat-chip";
import CozyTopbar from "../components/cozy-topbar";
import CozyWeeklyBars from "../components/cozy-weekly-bars";
import {
  COZY_BASE,
  COZY_FONT_STACK,
  COZY_INK,
  COZY_INK_SOFT,
  COZY_PALETTES,
} from "~/core/lib/cozy-tokens";

export const meta: Route.MetaFunction = () => [
  { title: "대시보드 | Lidam Edu" },
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

  return {
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
  };
}


const EXAM_DATE_FALLBACK_ISO = "2026-07-23";

function formatExamDateKo(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}

function formatHours(ms: number): string {
  if (ms <= 0) return "0";
  const h = ms / (60 * 60 * 1000);
  if (h >= 10) return Math.round(h).toString();
  return h.toFixed(1);
}

function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

const KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const {
    user,
    blankSummary,
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
    pendingAssignments,
    passPrediction,
  } = loaderData;

  const examDateIso = goals.examDate ?? EXAM_DATE_FALLBACK_ISO;
  const examDateLabel = formatExamDateKo(examDateIso);
  const goalsConfigured = goals.examDate !== null;

  // 히트맵용 — 일별 강도(0..1) = (timeMs / 90분) clamp.
  const heatmapDays = dailyStats.days.map((d) => ({
    date: d.date,
    intensity: Math.min(1, d.timeMs / (90 * 60 * 1000)),
  }));

  // 이번 주(월~일) 7일치 — daily.days 끝쪽에서 오늘 요일 기준 슬라이스.
  const todayKstIdx = (new Date().getDay() + 6) % 7; // 월=0..일=6
  const startSliceFromEnd = todayKstIdx + 1; // 오늘 포함 월요일까지
  const weekSlice = dailyStats.days.slice(-startSliceFromEnd);
  const weekly: ReadonlyArray<{ d: string; h: number; today: boolean }> =
    KOREAN_WEEKDAYS.map((label, i) => {
      const day = weekSlice[i];
      return {
        d: label,
        h: day ? day.timeMs / (60 * 60 * 1000) : 0,
        today: i === todayKstIdx,
      };
    });
  const examDday = Math.max(
    0,
    Math.ceil(
      (new Date(examDateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    ),
  );
  const last7dCount = kpis.last7d.totalProblemsAttempted;
  const last7dHours = formatHours(kpis.last7d.totalProblemTimeMs);
  const palette = COZY_PALETTES.sage;

  // 오늘 진척도 — 마지막 days 항목 = 오늘 (KST).
  const todayMs = dailyStats.days[dailyStats.days.length - 1]?.timeMs ?? 0;
  const todayHours = todayMs / (60 * 60 * 1000);
  const dailyTargetHours = goals.weeklyGoalHours / 7;
  const todayPct =
    dailyTargetHours > 0
      ? Math.min(100, Math.round((todayHours / dailyTargetHours) * 100))
      : 0;
  const todayRemainingHours = Math.max(0, dailyTargetHours - todayHours);

  const avatarInitials = user.name.slice(0, Math.min(2, user.name.length));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COZY_BASE,
        fontFamily: COZY_FONT_STACK,
        color: COZY_INK,
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
      className="dashboard-cozy"
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          backgroundImage: `radial-gradient(${palette.soft}55 1px, transparent 1px)`,
          backgroundSize: "4px 4px",
        }}
      />

      <CozySidebar palette={palette} />

      <main
        className="cozy-main"
        style={{
          flex: 1,
          padding: "28px 40px 40px",
          minWidth: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <CozyTopbar
          palette={palette}
          user={{
            name: user.name,
            avatarInitials,
            cohort: user.cohort,
          }}
        />

        <PassPredictionCard prediction={passPrediction} palette={palette} />

        {pendingAssignments.length > 0 ? (
          <PendingAssignmentsBanner items={pendingAssignments} palette={palette} />
        ) : null}

        <div
          style={{
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{ fontSize: 13, color: COZY_INK_SOFT, marginBottom: 6 }}
              data-testid="today-label"
            >
              {todayLabel}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              어서오세요, {user.name}님 ☕
            </h1>
            <p
              style={{ margin: "6px 0 0", fontSize: 14, color: COZY_INK_SOFT }}
            >
              오늘도 한 걸음씩, 차근차근 가봐요.
            </p>
          </div>

          <div
            style={{
              background: "#FFF",
              border: `1.5px solid ${palette.primary}`,
              borderRadius: 999,
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 2px 16px rgba(107,66,38,0.08)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: palette.primary,
                color: "#FFF",
                display: "grid",
                placeItems: "center",
                fontFamily: "Georgia, serif",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.02em",
              }}
            >
              D-{examDday}
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: COZY_INK_SOFT,
                  marginBottom: 2,
                }}
              >
                변리사 1차 시험까지
              </div>
              <div
                style={{ fontSize: 13.5, fontWeight: 600 }}
                data-testid="exam-date-label"
              >
                {examDateLabel}
                {!goalsConfigured ? (
                  <Link
                    to="/goals"
                    style={{
                      marginLeft: 6,
                      fontSize: 10.5,
                      color: COZY_INK_SOFT,
                      textDecoration: "underline",
                    }}
                  >
                    설정
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div
          className="cozy-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <CozyStatChip
            icon="clock"
            label="누적 풀이 시간"
            value={formatHours(kpis.totalProblemTimeMs)}
            unit="시간"
            delta={
              last7dHours === "0" ? "지난주 기록 없음" : `+${last7dHours}h 지난주`
            }
            palette={palette}
          />
          <CozyStatChip
            icon="check"
            label="푼 문제 수"
            value={formatCount(kpis.totalProblemsAttempted)}
            unit="문항"
            delta={
              last7dCount === 0 ? "지난주 0" : `+${formatCount(last7dCount)} 지난주`
            }
            palette={palette}
          />
          <CozyStatChip
            icon="target"
            label="평균 정답률"
            value={String(kpis.overallAccuracyPct)}
            unit="%"
            delta={
              kpis.totalProblemsAttempted > 0
                ? `${kpis.totalProblemsAttempted}문항 기준`
                : "데이터 없음"
            }
            palette={palette}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <CozyCard title="전체 학습 진척도" subtitle="법령 / 판례 / 문제">
            <div
              style={{
                display: "flex",
                justifyContent: "space-around",
                gap: 16,
                flexWrap: "wrap",
                padding: "8px 0 4px",
              }}
              data-testid="overall-progress"
            >
              <CozyProgressDonut
                label="조문 학습"
                current={overallProgress.articles.visited}
                total={overallProgress.articles.total}
                pct={overallProgress.articles.pct}
                unit="조"
                palette={palette}
                testId="donut-articles"
              />
              <CozyProgressDonut
                label="판례 학습"
                current={overallProgress.cases.visited}
                total={overallProgress.cases.total}
                pct={overallProgress.cases.pct}
                unit="건"
                palette={palette}
                testId="donut-cases"
              />
              <CozyProgressDonut
                label="문제 풀이"
                current={overallProgress.problems.attempted}
                total={overallProgress.problems.total}
                pct={overallProgress.problems.pct}
                unit="문항"
                palette={palette}
                testId="donut-problems"
              />
            </div>
          </CozyCard>
        </div>

        <div
          className="cozy-grid-3"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr 1fr",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <CozyCard
            title="오늘의 진척도"
            subtitle={`목표 ${dailyTargetHours.toFixed(1)}시간 (주간 ${goals.weeklyGoalHours}h ÷ 7)`}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
              data-testid="today-progress"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                    data-testid="today-hours"
                  >
                    {todayHours.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 14, color: COZY_INK_SOFT }}>
                    h / {dailyTargetHours.toFixed(1)}h
                  </span>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: palette.tint,
                    color: palette.primary,
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                  title="연속 학습 일수"
                >
                  <FlameIcon style={{ width: 12, height: 12 }} />
                  {dailyStats.currentStreak}일 연속
                </div>
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  background: palette.tint,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${todayPct}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${palette.accent}, ${palette.primary})`,
                    transition: "width 200ms",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COZY_INK_SOFT,
                }}
              >
                {todayPct >= 100 ? (
                  <span style={{ color: palette.primary, fontWeight: 600 }}>
                    오늘 목표 달성! 🎉
                  </span>
                ) : (
                  <>
                    남은{" "}
                    <span
                      style={{
                        color: COZY_INK,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {todayRemainingHours.toFixed(1)}h
                    </span>{" "}
                    · 진척{" "}
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {todayPct}%
                    </span>
                  </>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <QuickAction
                  to="/subjects/patent/quiz/setup"
                  icon={<SlidersHorizontalIcon style={{ width: 12, height: 12 }} />}
                  label="맞춤 퀴즈"
                  palette={palette}
                />
                <QuickAction
                  to="/study/wrong-note"
                  icon={<NotebookPenIcon style={{ width: 12, height: 12 }} />}
                  label="오답노트"
                  palette={palette}
                />
                <QuickAction
                  to="/subjects/patent/problems/system"
                  icon={<ListChecksIcon style={{ width: 12, height: 12 }} />}
                  label="체계별 풀이"
                  palette={palette}
                />
              </div>
            </div>
          </CozyCard>

          <CozyCard
            title="자연과학 (1차 선택)"
            subtitle="4과목 풀이/정답률 — 선택 과목만 학습"
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
              data-testid="science-progress"
            >
              {scienceProgress.map((s) => {
                const sectionSlug = s.slug.replace("_", "-");
                const seeded = s.total > 0;
                return (
                  <Link
                    key={s.slug}
                    to={`/subjects/science/${sectionSlug}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      opacity: seeded ? 1 : 0.55,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        <span style={{ marginRight: 6 }}>{s.emoji}</span>
                        {s.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: COZY_INK_SOFT,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {seeded
                          ? `${s.attempted}/${s.total}${
                              s.accuracyPct !== null
                                ? ` · ${s.accuracyPct}%`
                                : ""
                            }`
                          : "문제 미시드"}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: palette.tint,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${
                            s.total > 0
                              ? Math.min(100, Math.round((s.attempted / s.total) * 100))
                              : 0
                          }%`,
                          height: "100%",
                          background: `linear-gradient(90deg, ${palette.accent}, ${palette.primary})`,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CozyCard>

          <CozyCard title="과목별 진도" subtitle="조문 열람 기준">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
              data-testid="subjects-progress"
            >
              {subjectsProgress.map((s) => (
                <Link
                  key={s.lawCode}
                  to={`/subjects/${s.lawCode}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {s.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: COZY_INK_SOFT,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {s.pctViewed}% · 문제 {s.problemsAttempted}
                      {s.accuracyPct !== null ? ` · ${s.accuracyPct}%` : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: palette.tint,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${s.pctViewed}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${palette.accent}, ${palette.primary})`,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </CozyCard>

          <CozyCard
            title="약점 우선 복습"
            subtitle={
              weakAreas.length > 0
                ? `오답 ${weakAreas.length}건 · 어려움 순`
                : "오답이 없습니다"
            }
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
              data-testid="weak-areas"
            >
              {weakAreas.length === 0 ? (
                <p
                  style={{
                    fontSize: 12.5,
                    color: COZY_INK_SOFT,
                    margin: "8px 0",
                  }}
                >
                  최근 시도한 문제 중 오답이 없습니다. 새 문제를 풀어보세요.
                </p>
              ) : (
                weakAreas.map((w) => (
                  <Link
                    key={w.problemId}
                    to={`/subjects/${w.lawCode}/problems/${w.problemId}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "flex",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: palette.tint,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: palette.primary,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          {LAW_SUBJECTS[w.lawCode].name}
                        </span>
                        {w.bucket ? (
                          <span
                            className={DIFFICULTY_TONE[w.bucket]}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 999,
                            }}
                          >
                            {DIFFICULTY_LABEL[w.bucket]}
                            {w.globalAccuracyPct !== null
                              ? ` ${w.globalAccuracyPct}%`
                              : ""}
                          </span>
                        ) : null}
                        {w.year ? (
                          <span
                            style={{
                              fontSize: 9.5,
                              color: COZY_INK_SOFT,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {w.year}
                            {w.problemNumber ? ` · ${w.problemNumber}번` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {w.bodySnippet}
                      </div>
                    </div>
                  </Link>
                ))
              )}
              <Link
                to="/study/wrong-note"
                style={{
                  textDecoration: "none",
                  textAlign: "center",
                  padding: "8px",
                  borderRadius: 10,
                  background: palette.primary,
                  color: "#FFF",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                전체 오답노트 보기 →
              </Link>
            </div>
          </CozyCard>

          <CozyCard
            title="약점 단원 (체계도)"
            subtitle={
              weakNodes.length > 0
                ? `정답률 낮은 ${weakNodes.length}개 단원`
                : "충분한 풀이 데이터가 없습니다"
            }
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
              data-testid="weak-nodes"
            >
              {weakNodes.length === 0 ? (
                <p
                  style={{
                    fontSize: 12.5,
                    color: COZY_INK_SOFT,
                    margin: "8px 0",
                  }}
                >
                  단원별 약점을 보려면 더 많은 문제를 풀어보세요 (단원당 5문제
                  이상).
                </p>
              ) : (
                weakNodes.map((n) => (
                  <Link
                    key={n.nodeId}
                    to={`/subjects/${n.lawCode}/systematic/${n.nodeId}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "flex",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: palette.tint,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: palette.primary,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          {LAW_SUBJECTS[n.lawCode].name}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 999,
                            background:
                              n.accuracyPct < 30
                                ? "#fecaca"
                                : n.accuracyPct < 60
                                  ? "#fde68a"
                                  : "#bbf7d0",
                            color:
                              n.accuracyPct < 30
                                ? "#9f1239"
                                : n.accuracyPct < 60
                                  ? "#92400e"
                                  : "#166534",
                          }}
                        >
                          정답률 {n.accuracyPct}%
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            color: COZY_INK_SOFT,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {n.problemAttempts}회 풀이
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.4,
                          fontWeight: 600,
                        }}
                      >
                        {n.displayLabel}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CozyCard>
        </div>

        <div
          className="cozy-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 18,
          }}
        >
          <CozyCard title="학습 히트맵" subtitle="최근 12주">
            <CozyHeatmap palette={palette} days={heatmapDays} />
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: COZY_INK_SOFT,
                flexWrap: "wrap",
              }}
            >
              <span>덜</span>
              {[
                "#F2EAE0",
                palette.soft,
                palette.accent + "aa",
                palette.accent,
                palette.primary,
              ].map((c) => (
                <div
                  key={c}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: c,
                  }}
                />
              ))}
              <span>더</span>
              <span style={{ marginLeft: "auto" }} data-testid="heatmap-summary">
                총 {dailyStats.totalActiveDays}일 학습 · 평균{" "}
                {dailyStats.avgHoursPerActiveDay.toFixed(1)}시간/일 ·
                연속 {dailyStats.currentStreak}일
              </span>
            </div>
          </CozyCard>

          <CozyCard
            title="이번 주 학습량"
            subtitle={`목표 ${goals.weeklyGoalHours}시간`}
          >
            <CozyWeeklyBars
              palette={palette}
              days={weekly}
              weeklyGoalHours={goals.weeklyGoalHours}
            />
          </CozyCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <CozyCard
            title="재학습 진입점"
            subtitle="오답노트 · 즐겨찾기 · 메모 — 한 곳에서 다시 학습"
          >
            <div
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
              style={{ marginTop: 4 }}
              data-testid="study-aid-tiles"
            >
              <StudyAidTile
                palette={palette}
                href="/study/wrong-note"
                label="오답노트"
                count={studyAidCounts.wrongMcq + studyAidCounts.wrongOx}
                hint={`객관식 ${studyAidCounts.wrongMcq} · OX ${studyAidCounts.wrongOx}`}
              />
              <StudyAidTile
                palette={palette}
                href="/study/bookmarks"
                label="즐겨찾기"
                count={studyAidCounts.bookmarks}
                hint="별점 매긴 조문·판례·문제·OX"
              />
              <StudyAidTile
                palette={palette}
                href="/study/notes"
                label="메모"
                count={studyAidCounts.memos}
                hint="작성한 메모 검색·열람"
              />
              <StudyAidTile
                palette={palette}
                href="/study/highlights"
                label="하이라이트"
                count={studyAidCounts.highlights}
                hint="색칠한 본문 발췌 모음"
              />
            </div>
          </CozyCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <CozyCard
            title="즐겨찾기 빠른 접근"
            subtitle={
              topBookmarks.length > 0
                ? `${topBookmarks.length}개 (별점 높은 순)`
                : "즐겨찾기가 비어있습니다"
            }
          >
            {topBookmarks.length === 0 ? (
              <p
                style={{
                  fontSize: 12.5,
                  color: COZY_INK_SOFT,
                  margin: "8px 0",
                }}
                data-testid="quick-bookmarks-empty"
              >
                조문 / 판례 / 문제 viewer 우측 패널에서 ♡ 별점을 매겨보세요.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                data-testid="quick-bookmarks"
              >
                {topBookmarks.map((b) => (
                  <Link
                    key={`${b.targetType}-${b.targetId}`}
                    to={b.href}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: palette.tint,
                      fontSize: 11.5,
                    }}
                    title={`${b.targetType} · ★${b.starLevel}`}
                  >
                    <span
                      style={{ fontSize: 9.5, color: palette.primary, fontWeight: 700 }}
                    >
                      {b.targetType === "article"
                        ? "조문"
                        : b.targetType === "case"
                          ? "판례"
                          : "문제"}
                    </span>
                    <span>{b.label}</span>
                    <span style={{ color: "#e11d48", fontSize: 10 }}>
                      {"♡".repeat(b.starLevel)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link
              to="/study/bookmarks"
              style={{
                display: "inline-block",
                marginTop: 10,
                fontSize: 11.5,
                color: palette.primary,
                fontWeight: 600,
                textDecoration: "none",
              }}
              data-testid="quick-bookmarks-all"
            >
              즐겨찾기 모두 보기 (조문 · 판례 · 문제 · OX) →
            </Link>
          </CozyCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <CozyCard
            title="최근 학습 피드"
            subtitle={
              recentActivity.length > 0
                ? `최근 ${recentActivity.length}건 (조문 · 판례 · 문제 통합)`
                : "최근 학습 활동이 없습니다"
            }
          >
            {recentActivity.length === 0 ? (
              <p
                style={{
                  fontSize: 12.5,
                  color: COZY_INK_SOFT,
                  margin: "8px 0",
                }}
                data-testid="recent-activity-empty"
              >
                조문/판례/문제 viewer 진입 시 자동 기록됩니다.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
                data-testid="recent-activity"
              >
                {recentActivity.map((it) => (
                  <li key={`${it.type}-${it.targetId}-${it.startedAt}`}>
                    <Link
                      to={it.href}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "flex",
                        gap: 10,
                        alignItems: "baseline",
                        padding: "6px 8px",
                        borderRadius: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          color: palette.primary,
                          textTransform: "uppercase",
                          minWidth: 32,
                        }}
                      >
                        {it.type === "article"
                          ? "조문"
                          : it.type === "case"
                            ? "판례"
                            : "문제"}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: COZY_INK_SOFT,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.startedAt.slice(0, 10)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CozyCard>
        </div>

        <div
          className="cozy-grid-2"
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
          }}
        >
          <CozyCard
            title="신규 법 개정"
            subtitle={
              recentRevisions.length > 0
                ? `${recentRevisions.length}건 (최신순)`
                : "공지된 개정이 없습니다"
            }
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
              data-testid="recent-revisions"
            >
              {recentRevisions.length === 0 ? (
                <p
                  style={{
                    fontSize: 12.5,
                    color: COZY_INK_SOFT,
                    margin: "8px 0",
                  }}
                >
                  최근 공포된 법 개정이 없습니다.
                </p>
              ) : (
                recentRevisions.map((r) => (
                  <Link
                    key={r.lawRevisionId}
                    to={`/subjects/${r.lawCode}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "flex",
                      gap: 10,
                      alignItems: "baseline",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: palette.tint,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: palette.primary,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.lawName}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.revisionNumber ?? "—"} 개정
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: COZY_INK_SOFT,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.affectedArticleCount > 0
                        ? `${r.affectedArticleCount}조`
                        : ""}
                      {r.myBookmarkedAffectedCount > 0
                        ? ` · ★${r.myBookmarkedAffectedCount}`
                        : ""}
                      {r.effectiveDate ? ` · 시행 ${r.effectiveDate}` : ""}
                    </span>
                  </Link>
                ))
              )}
              <Link
                to="/latest/laws"
                style={{
                  textDecoration: "none",
                  textAlign: "center",
                  padding: "8px",
                  borderRadius: 10,
                  background: palette.primary,
                  color: "#FFF",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                모든 개정 보기 →
              </Link>
            </div>
          </CozyCard>

          <CozyCard
            title="최근 판례"
            subtitle={
              recentCases.length > 0
                ? `${recentCases.length}건 (선고일 최신순)`
                : "등록된 판례가 없습니다"
            }
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
              data-testid="recent-cases"
            >
              {recentCases.length === 0 ? (
                <p
                  style={{
                    fontSize: 12.5,
                    color: COZY_INK_SOFT,
                    margin: "8px 0",
                  }}
                >
                  등록된 판례가 없습니다.
                </p>
              ) : (
                recentCases.map((c) => {
                  const firstSubject = c.subjectLaws[0] ?? "patent";
                  return (
                    <Link
                      key={c.caseId}
                      to={`/subjects/${firstSubject}/cases/${c.caseId}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: palette.tint,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: palette.primary,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          {c.caseNumber}
                        </span>
                        {c.isEnBanc ? (
                          <span
                            style={{
                              fontSize: 9.5,
                              color: COZY_INK_SOFT,
                            }}
                          >
                            전합
                          </span>
                        ) : null}
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 10.5,
                            color: COZY_INK_SOFT,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {c.decidedAt}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.35,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.summaryTitle ?? c.caseTitle}
                      </div>
                    </Link>
                  );
                })
              )}
              <Link
                to="/latest/cases"
                style={{
                  textDecoration: "none",
                  textAlign: "center",
                  padding: "8px",
                  borderRadius: 10,
                  background: palette.primary,
                  color: "#FFF",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                모든 판례 보기 →
              </Link>
            </div>
          </CozyCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <CozyCard
            title="빈칸 · 암기 학습"
            subtitle="내용 · 주체 · 시기 · 암기 모드 정답률 / 유사도"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <BlankSummaryTile
                label="내용 빈칸"
                summary={blankSummary.content}
                palette={palette}
              />
              <BlankSummaryTile
                label="주체 빈칸"
                summary={blankSummary.subject}
                palette={palette}
              />
              <BlankSummaryTile
                label="시기 빈칸"
                summary={blankSummary.period}
                palette={palette}
              />
              <BlankSummaryTile
                label="암기"
                summary={blankSummary.recitation}
                palette={palette}
              />
            </div>
            <Link
              to="/study/stats?tab=blanks"
              style={{
                display: "block",
                textDecoration: "none",
                cursor: "pointer",
                textAlign: "center",
                padding: "10px",
                borderRadius: 10,
                background: palette.primary,
                color: "#FFF",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              상세 통계 보기 →
            </Link>
          </CozyCard>
        </div>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .dashboard-cozy { flex-direction: column; }
          .dashboard-cozy aside { width: 100%; padding: 20px; }
          .cozy-main { padding: 16px; }
        }
        @media (max-width: 1024px) and (min-width: 641px) {
          /* tablet — KPI 3 → 자동 줄바꿈 + 도넛 wrap. */
          .cozy-stats { grid-template-columns: repeat(2, 1fr); }
          .cozy-grid-3 { grid-template-columns: 1fr 1fr; }
          .cozy-grid-3 > :first-child { grid-column: span 2; }
          .cozy-grid-2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          /* mobile */
          .cozy-main { padding: 12px 14px; }
          .cozy-stats { grid-template-columns: 1fr; gap: 10px; }
          .cozy-grid-3 { grid-template-columns: 1fr; gap: 12px; }
          .cozy-grid-2 { grid-template-columns: 1fr; gap: 12px; }
        }
        @media (min-width: 1025px) and (max-width: 1280px) {
          .cozy-grid-3 { grid-template-columns: 1fr 1fr; }
          .cozy-grid-3 > :first-child { grid-column: span 2; }
        }
      `}</style>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  label,
  palette,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  palette: { primary: string; tint: string; accent: string };
}) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "8px 6px",
        borderRadius: 8,
        background: palette.tint,
        color: palette.primary,
        fontSize: 11.5,
        fontWeight: 600,
        textDecoration: "none",
        textAlign: "center",
      }}
    >
      {icon}
      {label}
    </Link>
  );
}

function StudyAidTile({
  href,
  label,
  count,
  hint,
  palette,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
  palette: { primary: string; tint: string; accent: string };
}) {
  return (
    <Link
      to={href}
      style={{
        background: palette.tint,
        borderRadius: 12,
        padding: "12px 14px",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: "0.04em",
          color: palette.primary,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: COZY_INK,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count.toLocaleString("ko-KR")}
        <span style={{ fontSize: 11, color: COZY_INK_SOFT, marginLeft: 4 }}>
          건
        </span>
      </span>
      <span style={{ fontSize: 11, color: COZY_INK_SOFT, lineHeight: 1.3 }}>
        {hint}
      </span>
    </Link>
  );
}

function BlankSummaryTile({
  label,
  summary,
  palette,
}: {
  label: string;
  summary: { total: number; correct: number; accuracy: number; weak: number };
  palette: { primary: string; tint: string; soft: string; accent: string };
}) {
  return (
    <div
      style={{
        background: palette.tint,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: COZY_INK_SOFT,
          fontWeight: 600,
          letterSpacing: "0.02em",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {summary.accuracy}
        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 2 }}>%</span>
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: COZY_INK_SOFT,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {summary.correct} / {summary.total} 정답
        {summary.weak > 0 ? (
          <span
            style={{
              marginLeft: 6,
              color: "#C44A36",
              fontWeight: 600,
            }}
          >
            · 약점 {summary.weak}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// feat-7-024 — 합격 진단 카드
const RATING_BG: Record<PassPrediction["rating"], string> = {
  안정: "#16A34A",
  가능: "#65A30D",
  주의: "#D97706",
  취약: "#DC2626",
};

function PassPredictionCard({
  prediction,
  palette,
}: {
  prediction: PassPrediction;
  palette: { primary: string; tint: string };
}) {
  const bg = RATING_BG[prediction.rating];
  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        background: palette.tint,
        borderRadius: 14,
        border: `1px solid ${COZY_INK}1A`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: 12,
              background: bg,
              color: "#FFF",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {prediction.score}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.95 }}>
              {prediction.rating}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: COZY_INK,
                marginBottom: 4,
              }}
            >
              🎯 합격 진단 점수
            </div>
            <div style={{ fontSize: 12, color: COZY_INK_SOFT, maxWidth: 340 }}>
              {prediction.hint}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              prediction.components.gs !== null
                ? "repeat(5, 1fr)"
                : "repeat(4, 1fr)",
            gap: 8,
            minWidth: 280,
          }}
        >
          <ComponentChip label="학습량" value={prediction.components.study} />
          <ComponentChip
            label="정답률"
            value={prediction.components.accuracy}
          />
          {prediction.components.gs !== null ? (
            <ComponentChip label="GS" value={prediction.components.gs} />
          ) : null}
          <ComponentChip
            label="활성도"
            value={prediction.components.activity}
          />
          <ComponentChip
            label="과제 완수"
            value={prediction.components.completion}
          />
        </div>
      </div>
    </div>
  );
}

function ComponentChip({ label, value }: { label: string; value: number }) {
  const bg =
    value >= 80
      ? "#DCFCE7"
      : value >= 60
        ? "#ECFCCB"
        : value >= 40
          ? "#FEF3C7"
          : "#FEE2E2";
  return (
    <div
      style={{
        background: "#FFF",
        border: `1px solid ${COZY_INK}14`,
        borderRadius: 10,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10, color: COZY_INK_SOFT, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: COZY_INK,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          height: 4,
          background: bg,
          borderRadius: 2,
          width: `${value}%`,
          minWidth: 4,
        }}
      />
    </div>
  );
}

// feat-7-021 — 마감 임박 과제 배너
function PendingAssignmentsBanner({
  items,
  palette,
}: {
  items: Awaited<
    ReturnType<
      typeof import("~/features/assignments/queries.server").listStudentAssignments
    >
  >;
  palette: { primary: string; tint: string };
}) {
  const now = Date.now();
  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        background: palette.tint,
        borderRadius: 14,
        border: `1px solid ${COZY_INK}1A`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: COZY_INK }}>
          📌 마감 임박 과제 ({items.length})
        </span>
        <Link
          to="/assignments"
          style={{
            fontSize: 12,
            color: palette.primary,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          전체 보기 →
        </Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((a) => {
          const sub = a.submission;
          const total = sub?.totalItems ?? a.itemCount;
          const completed = sub?.completedItems ?? 0;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const overdue = new Date(a.dueAt).getTime() < now;
          return (
            <Link
              key={a.assignmentId}
              to={`/assignments/${a.assignmentId}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "#FFF",
                borderRadius: 10,
                border: `1px solid ${COZY_INK}14`,
                textDecoration: "none",
                color: COZY_INK,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>
                {a.title}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: overdue ? "#DC2626" : COZY_INK_SOFT,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {overdue ? "🚨 " : ""}마감 {a.dueAt.slice(5, 10)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: COZY_INK_SOFT,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {completed}/{total} ({pct}%)
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

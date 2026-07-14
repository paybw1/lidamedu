// feat-2-008 — 통합 학습현황 페이지 (/study/stats)
// 4 탭(학습 종류 기준): 한눈에 / 진도·정답률 / 암기 / 약점.
//   (구 "정답률" 탭은 진도 탭으로 통폐합 — 과목 카드가 진도와 정답률을 함께 보여준다.)
//   차수(1차/2차)는 탭이 아니라 진도·정답률 탭 섹션 안에서 필터(feat-2-025 보존).
// 각 탭은 서버 loader 가 일괄 fetch 한 데이터에서 슬라이스만 렌더.
import type { Route } from "./+types/stats";

import {
  ArrowRightIcon,
  AwardIcon,
  BookOpenIcon,
  BookmarkIcon,
  BrainIcon,
  CalendarIcon,
  ClockIcon,
  GavelIcon,
  HighlighterIcon,
  ListChecksIcon,
  PencilLineIcon,
  StickyNoteIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Suspense } from "react";
import {
  Await,
  Link,
  type ShouldRevalidateFunctionArgs,
  data,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import { PageHeader, StudentShell, Surface } from "~/core/components/student";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { scoreBgTone } from "~/core/lib/chart-colors";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { BlankStatsTabs } from "~/features/blanks/components/blank-stats-tabs";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import {
  type MyIssueTrainingStats,
  getMyIssueTrainingStats,
} from "~/features/cases/queries-case-training.server";
import { getPasserBenchmarks } from "~/features/exam-results/analytics.server";
import { isPasserBenchmarkEnabled } from "~/features/exam-results/passer-benchmark-gate.server";
import {
  hasMyAnalysisConsent,
  hasPoolConsent,
  setNextExamPlan,
} from "~/features/exam-results/queries.server";
import {
  getExamScheduleDate,
  getStudyGoals,
  listExamPlanOptions,
  upsertStudyGoals,
} from "~/features/goals/queries.server";
import { listMyOxSessions } from "~/features/mcq-packs/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";
import { getActivityHeatmap } from "~/features/study/activity-heatmap.server";
import { ActivityHeatmap } from "~/features/study/components/activity-heatmap";
import { getCohortStudyPercentile } from "~/features/study/cohort-percentile.server";
import { getGamificationSummary } from "~/features/study/gamification.server";
import { getNodeMastery } from "~/features/study/mastery.server";
import { GoalSummaryBar } from "~/features/study/components/goal-summary-bar";
import { MyAnalysisOffNotice } from "~/features/study/components/my-analysis-off-notice";
import { OxDiagnosisView } from "~/features/study/components/ox-diagnosis-view";
import { PasserCalibrationCard } from "~/features/study/components/passer-calibration-card";
import { ProgressLauncher } from "~/features/study/components/progress-launcher";
import {
  type LauncherScience,
  type LauncherSubject,
} from "~/features/study/components/progress-subject-card";
import {
  ALL_RANGE_SELECTION,
  type RangeSelection,
  RangeSelectionGroup,
} from "~/features/study/components/study-aids-list";
import { summarizeMastery } from "~/features/study/lib/mastery";
import { computeOxDiagnosis } from "~/features/study/lib/ox-diagnosis.server";
import {
  type PassPredictionSnapshotItem,
  type UserWeeklyAccuracyItem,
  getAllSubjectsProgress,
  getArticleStudyStats,
  getCaseStudyStats,
  getDailyStudyStats,
  getDashboardKpis,
  getLastStudyPointsBySubject,
  getOverallProgress,
  getStudyAidCounts,
  getUserAccuracyTrend,
  getUserPassPredictionTrend,
  getUserSubjectiveStats,
  getWeakAreas,
} from "~/features/study/queries.server";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

// 탭 = 학습 종류 기준(한눈에·진도/정답률·암기·약점). 차수(1차/2차)는 탭이 아니라
//   진도·정답률 탭 섹션 안에서 필터(feat-2-025 보존). blanks·ox_diagnosis 값은
//   외부 redirect 딥링크(/study/blanks·/study/ox-diagnosis) 보존 위해 유지, 라벨만 암기·약점.
const TAB_VALUES = ["overview", "progress", "blanks", "ox_diagnosis"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const DEFAULT_TAB: TabValue = "overview";

function isTabValue(v: string | null): v is TabValue {
  return v !== null && (TAB_VALUES as readonly string[]).includes(v);
}

// feat-3-209 — stats 페이지의 시계열 차트(누적 학습량/주간 정답률/합격 가능성) 기간 preset.
// 누적 통계(정답률·학습한 조문 수 등) 는 기간이 의미가 다르므로 V1 에서는 시계열에만 적용.
const RANGE_VALUES = ["today", "7d", "30d", "all"] as const;
type RangeValue = (typeof RANGE_VALUES)[number];
const DEFAULT_RANGE: RangeValue = "all";
const RANGE_LABEL: Record<RangeValue, string> = {
  today: "오늘",
  "7d": "7일",
  "30d": "30일",
  all: "전체",
};

// 시계열 query 인자 매핑: preset → (daysBack for daily/passTrend, weeks for accuracy).
const RANGE_QUERY_ARGS: Record<
  RangeValue,
  { dailyDays: number; trendWeeks: number; passDays: number }
> = {
  today: { dailyDays: 1, trendWeeks: 1, passDays: 1 },
  "7d": { dailyDays: 7, trendWeeks: 1, passDays: 7 },
  "30d": { dailyDays: 30, trendWeeks: 4, passDays: 30 },
  all: { dailyDays: 84, trendWeeks: 12, passDays: 30 },
};

// preset → since (KST 자정 기준 시작 시각). "all" 은 null = 전체 누적.
function presetToSince(preset: RangeValue): Date | null {
  if (preset === "all") return null;
  // KST(UTC+9) 자정 ms.
  const now = Date.now();
  const kstMs = now + 9 * 60 * 60 * 1000;
  const startKstMs = Math.floor(kstMs / 86400000) * 86400000;
  const todayUtcMs = startKstMs - 9 * 60 * 60 * 1000;
  if (preset === "today") return new Date(todayUtcMs);
  if (preset === "7d") return new Date(todayUtcMs - 6 * 86400000);
  if (preset === "30d") return new Date(todayUtcMs - 29 * 86400000);
  return null;
}

// "YYYY-MM-DD" → KST 자정 UTC ms. invalid 면 null.
function ymdToKstUtcMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - 9 * 60 * 60 * 1000;
}

function isRangeValue(v: string | null): v is RangeValue {
  return v !== null && (RANGE_VALUES as readonly string[]).includes(v);
}

// URL search params → RangeSelection. custom 인 경우 from/to 추출.
function parseRangeSelection(params: URLSearchParams): RangeSelection {
  const r = params.get("range");
  if (r === "custom") {
    return {
      kind: "custom",
      from: params.get("from"),
      to: params.get("to"),
    };
  }
  if (isRangeValue(r) && r !== DEFAULT_RANGE) {
    return { kind: "preset", preset: r };
  }
  return ALL_RANGE_SELECTION;
}

export const meta: Route.MetaFunction = () => [
  { title: "학습현황 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  // feat-8-026b A 게이트 — 미동의/철회 시 통계 미표시(데이터는 보존, 재동의 시 복구).
  // 단 목표 설정(띠+Sheet)은 분석이 아니라 기본 설정 → A-게이트와 무관하게 노출(통폐합 3a).
  if (!(await hasMyAnalysisConsent(client, user.id))) {
    const [studyGoals, examRoundRow, examOptions] = await Promise.all([
      getStudyGoals(client, user.id),
      client
        .from("profiles")
        .select("next_exam_round, next_exam_year")
        .eq("profile_id", user.id)
        .maybeSingle(),
      listExamPlanOptions(client),
    ]);
    const er = examRoundRow.data?.next_exam_round;
    const ey = examRoundRow.data?.next_exam_year;
    return {
      myAnalysisOff: true as const,
      studyGoals,
      examRound: (er === "first" || er === "second" ? er : null) as
        | "first"
        | "second"
        | null,
      examOptions,
      selectedPlan: er && ey ? `${ey}:${er}` : null,
    };
  }

  const url = new URL(request.url);
  const rangeSel = parseRangeSelection(url.searchParams);

  // 시계열 차트 인자.
  const tsKey: RangeValue =
    rangeSel.kind === "preset" ? rangeSel.preset : "all";
  const { dailyDays, trendWeeks, passDays } = RANGE_QUERY_ARGS[tsKey];

  // since/until 계산 — preset 이면 since 만, custom 이면 둘 다.
  let since: Date | null = null;
  let until: Date | null = null;
  if (rangeSel.kind === "preset") {
    since = presetToSince(rangeSel.preset);
  } else {
    if (rangeSel.from) {
      const ms = ymdToKstUtcMs(rangeSel.from);
      if (ms !== null) since = new Date(ms);
    }
    if (rangeSel.to) {
      const ms = ymdToKstUtcMs(rangeSel.to);
      // until 은 그 날 끝까지 — 다음날 자정 직전.
      if (ms !== null) until = new Date(ms + 86_400_000 - 1);
    }
  }
  // 시계열 query 옵션: custom 이면 since/until, preset 이면 days/weeks.
  const dailyOpts =
    rangeSel.kind === "custom" ? { since, until } : { daysBack: dailyDays };
  const trendOpts =
    rangeSel.kind === "custom" ? { since, until } : { weekCount: trendWeeks };
  const passOpts =
    rangeSel.kind === "custom" ? { since, until } : { days: passDays };

  const lawCodes = LAW_SUBJECT_SLUGS.map((s) => ({
    slug: s,
    name: LAW_SUBJECTS[s].name,
  }));

  // ox_diagnosis 매트릭스 = 가장 무거운 헬퍼(약점 탭 전용·TabsList 배지 없음).
  //   초기 응답 차단에서 분리(streaming defer) — 병렬 시작만 하고 await 하지 않는다.
  //   약점 탭에서 <Await> 로 스트리밍(?tab=ox_diagnosis 직접 진입도 로딩 후 동작).
  const oxDiagnosisPromise = computeOxDiagnosis(client, user.id);

  const [
    overall,
    kpis,
    aidCounts,
    subjectsProgress,
    daily,
    articleStats,
    caseStats,
    subjectiveStats,
    scienceProgress,
    weakAreas,
    blankContent,
    blankSubject,
    blankPeriod,
    recitation,
    accuracyTrend,
    heatmap,
    oxGate,
    passTrend,
    examRoundRow,
    studyGoals,
    passerBenchmark,
    oxSessions,
    lastPoints,
    nodeMastery,
    examOptions,
    trainingStats,
  ] = await Promise.all([
    getOverallProgress(client, user.id),
    getDashboardKpis(client, user.id, since),
    getStudyAidCounts(client, user.id, since),
    getAllSubjectsProgress(client, user.id, lawCodes),
    getDailyStudyStats(client, user.id, dailyOpts),
    getArticleStudyStats(client, user.id, lawCodes, since),
    getCaseStudyStats(client, user.id, lawCodes, since),
    getUserSubjectiveStats(client, user.id, lawCodes, since),
    getAllScienceSubjectsProgress(client, user.id),
    getWeakAreas(client, user.id, 5, since),
    getUserBlankStats(client, user.id, since),
    getUserAutoBlankStats(client, user.id, "subject", since),
    getUserAutoBlankStats(client, user.id, "period", since),
    getUserRecitationStats(client, user.id, since),
    getUserAccuracyTrend(client, user.id, trendOpts),
    getActivityHeatmap(client, user.id, 365),
    isPasserBenchmarkEnabled(),
    getUserPassPredictionTrend(client, user.id, passOpts),
    // 차수 SSOT(feat-2-025) — 학습목표 시험정보에서 고른 차수의 통계만 노출.
    // 미선택(null)이면 종전대로 1차·2차 모두 노출.
    client
      .from("profiles")
      .select("next_exam_round, next_exam_year")
      .eq("profile_id", user.id)
      .maybeSingle(),
    getStudyGoals(client, user.id),
    // 합격자 실측 보정(feat-8-019) — 게이트 ON + 풀(B) 동의 시만(goals 에서 이관).
    isPasserBenchmarkEnabled().then(async (gate) =>
      gate.enabled && (await hasPoolConsent(client, user.id))
        ? getPasserBenchmarks(user.id, { excludeSynthetic: true })
        : null,
    ),
    // 약점 탭 정오문제 응시 이력 compact 섹션(최근 5, 전체는 /me/ox-sessions). 경량 1쿼리.
    listMyOxSessions(client, user.id, { limit: 5 }),
    // 과목별 마지막 학습 지점(이어서 보기) — 진도 런처용. study_sessions 1회 + 배치 라벨.
    getLastStudyPointsBySubject(client, user.id, lawCodes),
    // feat-2-027 Phase 1 — 단원 마스터리(파생: 노드별 정답률 + SRS 파지).
    getNodeMastery(client, user.id, [...LAW_SUBJECT_SLUGS]),
    // 응시 시험 옵션 — 운영자 관리 시험 일정(exam_schedules).
    listExamPlanOptions(client),
    // feat-2-028 Stage 3 — 손공부(쟁점·목차 훈련) 지표.
    getMyIssueTrainingStats(client, user.id),
  ]);

  const erRaw = examRoundRow.data?.next_exam_round;
  const examRound: "first" | "second" | null =
    erRaw === "first" || erRaw === "second" ? erRaw : null;

  // feat-2-027 Phase 2 — 게임화 요약(레벨=마스터 단원 수 파생 + 스트릭). KST 오늘 기준.
  const masteredCount = summarizeMastery(
    nodeMastery.map((r) => r.stage),
  ).mastered;
  const todayYmd = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const gamification = await getGamificationSummary(
    client,
    user.id,
    todayYmd,
    masteredCount,
  );
  // Phase 3 공부량 코호트 구간 — ★B(pool) 동의자만(미동의=본인 성장만). 표본·격리는 서버 내부.
  const cohortStudyBand = (await hasPoolConsent(client, user.id))
    ? await getCohortStudyPercentile(user.id)
    : null;

  const examYear = examRoundRow.data?.next_exam_year ?? null;

  return {
    myAnalysisOff: false as const,
    examRound,
    examOptions,
    selectedPlan: examRound && examYear ? `${examYear}:${examRound}` : null,
    studyGoals,
    passerBenchmark,
    rangeSel,
    overall,
    kpis,
    aidCounts,
    subjectsProgress,
    daily,
    articleStats,
    caseStats,
    subjectiveStats,
    scienceProgress,
    weakAreas,
    accuracyTrend,
    passTrend,
    heatmap,
    oxDiagnosis: oxDiagnosisPromise,
    oxPasser: {
      enabled: oxGate.enabled,
      sampleSize: oxGate.realSampleSize,
      minSample: oxGate.minSample,
    },
    oxSessions,
    lastPoints,
    nodeMastery,
    gamification,
    cohortStudyBand,
    trainingStats,
    blanks: {
      content: blankContent,
      subject: blankSubject,
      period: blankPeriod,
      recitation,
    },
  };
}

const goalSchema = z.object({
  // "2027:first" — 응시 시험(연도·차수 통합). 빈 값 = 변경 없음(기존 시험일·차수 유지).
  examPlan: z
    .string()
    .regex(/^\d{4}:(first|second)$/, "응시 시험 형식 오류")
    .optional()
    .or(z.literal("")),
  weeklyGoalHours: z.coerce
    .number()
    .int()
    .min(0, "0 이상")
    .max(168, "주 168시간 이내"),
  examRound: z.enum(["first", "second"]),
  targetScore: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal("")])
    .optional(),
  notes: z.string().max(500, "500자 이내").optional().or(z.literal("")),
});

// 학습 목표 폼(상단 띠 Sheet) — goals 에서 이관(통폐합 3a).
// 응시 시험(연도:차수) 선택 → 시험일은 exam_schedules(운영자 관리)에서 자동 파생.
// 차수·연도=profiles SSOT(setNextExamPlan), 시험일 등=study_goals(upsertStudyGoals).
export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const form = await request.formData();
  const parsed = goalSchema.safeParse({
    examPlan: form.get("examPlan") ?? "",
    weeklyGoalHours: form.get("weeklyGoalHours") ?? "0",
    examRound: form.get("examRound") ?? "first",
    targetScore: form.get("targetScore") ?? "",
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return data({ error: first?.message ?? "입력 오류" }, { status: 400 });
  }

  const current = await getStudyGoals(client, user.id);
  let examDate = current.examDate; // 미선택 시 기존 시험일 유지
  if (parsed.data.examPlan) {
    const [yStr, round] = parsed.data.examPlan.split(":") as [
      string,
      "first" | "second",
    ];
    const year = Number(yStr);
    const scheduleDate = await getExamScheduleDate(client, year, round);
    if (!scheduleDate) {
      return data(
        { error: "선택한 시험 일정을 찾을 수 없습니다. 관리자에게 문의해 주세요." },
        { status: 400 },
      );
    }
    examDate = scheduleDate;
    const planRes = await setNextExamPlan(client, user.id, {
      nextExamYear: year,
      nextExamRound: round,
    });
    if (!planRes.ok) {
      return data({ error: planRes.error }, { status: 400 });
    }
  } else {
    // 응시 시험 미선택 — 차수 hidden(기존값)만 보존 갱신.
    const { data: profile } = await client
      .from("profiles")
      .select("next_exam_year")
      .eq("profile_id", user.id)
      .maybeSingle();
    const planRes = await setNextExamPlan(client, user.id, {
      nextExamYear: profile?.next_exam_year ?? null,
      nextExamRound: parsed.data.examRound,
    });
    if (!planRes.ok) {
      return data({ error: planRes.error }, { status: 400 });
    }
  }

  await upsertStudyGoals(client, user.id, {
    examDate,
    weeklyGoalHours: parsed.data.weeklyGoalHours,
    targetScore:
      typeof parsed.data.targetScore === "number"
        ? parsed.data.targetScore
        : null,
    notes: parsed.data.notes ? parsed.data.notes : null,
  });

  return { ok: true as const };
}

// 탭 전환(?tab=)은 클라 표시만 — loader 데이터는 tab 에 비의존이라 재fetch 불필요.
// range/from/to(시계열·누적 윈도우) 변화에서만 재검증 → 탭 클릭마다 18쿼리 재실행 방지.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  // 폼 제출(목표 저장) 후에는 재검증 — 저장 결과를 띠·진도에 반영.
  if (formMethod && formMethod.toUpperCase() !== "GET") return true;
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  const dataParams = ["range", "from", "to"];
  const changed = dataParams.some(
    (k) => currentUrl.searchParams.get(k) !== nextUrl.searchParams.get(k),
  );
  return changed ? defaultShouldRevalidate : false;
}

// RR7 loaderData 의 on-branch(myAnalysisOff:false) — 하위 탭 컴포넌트 공용 타입.
type StatsData = Extract<
  Route.ComponentProps["loaderData"],
  { myAnalysisOff: false }
>;

export default function StudyStats({ loaderData }: Route.ComponentProps) {
  if (loaderData.myAnalysisOff)
    return (
      <StudentShell width="wide" className="space-y-4">
        <GoalSummaryBar
          goals={loaderData.studyGoals}
          examRound={loaderData.examRound ?? "first"}
          examOptions={loaderData.examOptions}
          selectedPlan={loaderData.selectedPlan}
        />
        <MyAnalysisOffNotice feature="학습 통계" />
      </StudentShell>
    );
  return <StudyStatsInner loaderData={loaderData} />;
}

function StudyStatsInner({ loaderData }: { loaderData: StatsData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeSel: RangeSelection = loaderData.rangeSel;

  // 탭은 학습 종류 기준 — 차수 필터는 각 탭 섹션 안에서 적용(feat-2-025 보존).
  //   구 차수 탭 URL(?tab=first_exam 등)은 isTabValue 불일치 → 기본 탭(한눈에)으로 폴백.
  // 정답률 탭은 진도 탭으로 통폐합("진도/정답률") — 구 ?tab=accuracy 딥링크는 진도로 폴백.
  const rawTab = searchParams.get("tab");
  const tab: TabValue =
    rawTab === "accuracy"
      ? "progress"
      : isTabValue(rawTab)
        ? rawTab
        : DEFAULT_TAB;

  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === DEFAULT_TAB) params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { preventScrollReset: true, replace: true },
    );
  };

  // 기간 변경 시 URL ?range=&from=&to= 갱신 → loader 재호출 → query 갱신.
  // preventScrollReset 으로 위치 보존, replace 로 history 늘어남 방지.
  const setRange = (next: RangeSelection) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("range");
        params.delete("from");
        params.delete("to");
        if (next.kind === "custom") {
          params.set("range", "custom");
          if (next.from) params.set("from", next.from);
          if (next.to) params.set("to", next.to);
        } else if (next.preset !== DEFAULT_RANGE) {
          params.set("range", next.preset);
        }
        return params;
      },
      { preventScrollReset: true, replace: true },
    );
  };

  return (
    <StudentShell width="wide">
      <PageHeader
        area="manage"
        title="학습현황"
        description="차수를 골라 과목별 진도와 정답률을 한눈에 확인하고, 이어서 학습할 조문·판례·문제로 바로 이동합니다."
        actions={
          <div className="flex items-center gap-2">
            <GuideHelpButton screenKey="study-stats" />
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard" viewTransition>
                대시보드
              </Link>
            </Button>
          </div>
        }
      />

      {/* 목표 요약 띠 + 기간 선택 — 한 행(좌: 목표 요약 / 우: 기간), 좁으면 줄바꿈. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <GoalSummaryBar
          goals={loaderData.studyGoals}
          examRound={loaderData.examRound ?? "first"}
          examOptions={loaderData.examOptions}
          selectedPlan={loaderData.selectedPlan}
        />
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <RangeSelectionGroup value={rangeSel} onChange={setRange} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">한눈에</TabsTrigger>
          <TabsTrigger value="progress">진도/정답률</TabsTrigger>
          <TabsTrigger value="blanks">암기</TabsTrigger>
          <TabsTrigger value="ox_diagnosis">약점</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={loaderData} />
        </TabsContent>
        <TabsContent value="progress">
          <ProgressTab data={loaderData} />
        </TabsContent>
        <TabsContent value="blanks">
          <BlankStatsTabs
            content={loaderData.blanks.content}
            subject={loaderData.blanks.subject}
            period={loaderData.blanks.period}
            recitation={loaderData.blanks.recitation}
          />
        </TabsContent>
        <TabsContent value="ox_diagnosis">
          <WeaknessTab data={loaderData} />
        </TabsContent>
      </Tabs>
    </StudentShell>
  );
}

// ─── 한눈에 ───

const MILESTONE_EMOJI: Record<25 | 50 | 75 | 100, string> = {
  25: "🥉",
  50: "🥈",
  75: "🥇",
  100: "🏆",
};

function latestMilestone(pct: number): 25 | 50 | 75 | 100 | null {
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return null;
}

// feat-2-007 마일스톤 — 조문/판례/문제 진척 단계 뱃지(goals 에서 이관).
function MilestonesCard({ overall }: { overall: StatsData["overall"] }) {
  const milestones: Array<{
    label: string;
    pct: number;
    achievedAt: 25 | 50 | 75 | 100 | null;
  }> = [
    {
      label: "조문 학습",
      pct: overall.articles.pct,
      achievedAt: latestMilestone(overall.articles.pct),
    },
    {
      label: "판례 학습",
      pct: overall.cases.pct,
      achievedAt: latestMilestone(overall.cases.pct),
    },
    {
      label: "문제 풀이",
      pct: overall.problems.pct,
      achievedAt: latestMilestone(overall.problems.pct),
    },
  ];
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <AwardIcon className="size-4" /> 마일스톤
        </h2>
        <p className="text-muted-foreground text-xs">
          조문·판례·문제 진척률을 25/50/75/100% 단계로 보여 줍니다.
        </p>
      </div>
      <div className="px-6 pb-6">
        <div className="flex flex-wrap gap-2">
          {milestones.map((m) => (
            <Badge
              key={m.label}
              variant={m.achievedAt ? "default" : "outline"}
              className={cn(
                "gap-1 text-xs",
                m.achievedAt === 100 && "bg-emerald-600 hover:bg-emerald-700",
                m.achievedAt === 75 && "bg-amber-500 hover:bg-amber-600",
                m.achievedAt === 50 && "bg-sky-500 hover:bg-sky-600",
                m.achievedAt === 25 && "bg-stone-500 hover:bg-stone-600",
              )}
            >
              {m.achievedAt ? MILESTONE_EMOJI[m.achievedAt] : ""}
              {m.label} {m.pct}%
              {m.achievedAt
                ? ` · ${m.achievedAt}% 달성`
                : ` · 다음 25%까지 ${Math.max(0, 25 - m.pct)}%p`}
            </Badge>
          ))}
        </div>
      </div>
    </Surface>
  );
}

// feat-2-028 Stage 3 — 손공부(쟁점·목차 훈련) 지표. 눈공부 지표와 대비되는
// "산출" 신호: 쟁점추출 완료·평균 쟁점 적중률·결론·강약(목차) 완주.
function TrainingCard({ t }: { t: MyIssueTrainingStats }) {
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <PencilLineIcon className="size-4" /> 손공부 — 목차잡기
        </h2>
        <p className="text-muted-foreground text-xs">
          발문·판례에서 쟁점을 직접 뽑고 결론·목차를 손으로 정리한 기록입니다.
        </p>
      </div>
      <div className="px-6 pb-6">
        {t.issueDone === 0 && t.conclusionDone === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              아직 훈련 기록이 없습니다. 2차 답안의 절반은 쟁점 파악 —
              5분짜리 쟁점추출부터 시작해 보세요.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/case-training" viewTransition>
                목차잡기 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1 text-xs">
                쟁점추출 완료 {t.issueDone}회
              </Badge>
              {t.avgHitPct !== null ? (
                <Badge variant="secondary" className="gap-1 text-xs">
                  평균 쟁점 적중 {t.avgHitPct}%
                </Badge>
              ) : null}
              <Badge variant="secondary" className="gap-1 text-xs">
                결론·목차 완주 {t.conclusionDone}회
              </Badge>
              {t.lastAt ? (
                <Badge variant="outline" className="gap-1 text-xs">
                  최근 {t.lastAt.slice(0, 10)}
                </Badge>
              ) : null}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/case-training" viewTransition>
                이어서 훈련 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </Surface>
  );
}

// feat-2-027 Phase 1 — 단원 마스터리(학습한 단원의 숙련도 분포 + 정복 = 마스터 단원).
//   ★질 게이트는 서버(computeNodeMastery)에 — 여기선 분포/정복만 담백하게 표시.
function MasteryCard({ rows }: { rows: StatsData["nodeMastery"] }) {
  const summary = summarizeMastery(rows.map((r) => r.stage));
  const engaged = summary.learning + summary.familiar + summary.mastered;
  const mastered = rows.filter((r) => r.stage === "mastered");
  const widthPct = (n: number) => (engaged > 0 ? (n / engaged) * 100 : 0);
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <BrainIcon className="size-4" /> 단원 마스터리
        </h2>
        <p className="text-muted-foreground text-xs">
          학습한 단원의 숙련도입니다 · 정답률 85% 이상에 복습 2회를 통과하면
          마스터가 됩니다.
        </p>
      </div>
      <div className="space-y-3 px-6 pb-6">
        {engaged === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 학습한 단원이 없습니다. 문제를 풀면 단원별 숙련도가 쌓입니다.
          </p>
        ) : (
          <>
            <div className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-muted-foreground/30"
                style={{ width: `${widthPct(summary.learning)}%` }}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${widthPct(summary.familiar)}%` }}
              />
              <div
                className="bg-emerald-600"
                style={{ width: `${widthPct(summary.mastered)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                학습 중 {summary.learning}
              </span>
              <span className="font-medium text-sky-600 dark:text-sky-400">
                익숙 {summary.familiar}
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                마스터 {summary.mastered}
              </span>
              <span className="text-muted-foreground">
                · 학습 단원 {engaged}개
              </span>
            </div>
            {mastered.length > 0 ? (
              <p className="text-sm">
                🎯 정복한 단원{" "}
                <b className="text-emerald-600 dark:text-emerald-400">
                  {mastered.length}
                </b>
                개
                <span className="text-muted-foreground">
                  {" · "}
                  {mastered
                    .slice(0, 6)
                    .map((m) => m.displayLabel)
                    .join(" · ")}
                  {mastered.length > 6 ? " …" : ""}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                익숙해진 단원을 복습으로 2회 이상 통과하면 “마스터(정복)”로
                올라가요.
              </p>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}

// feat-2-027 Phase 2 — 성장(전체 레벨 + 스트릭). 평소 담백, 성취 순간만 살짝, 학기초 격려.
function GrowthCard({ g }: { g: StatsData["gamification"] }) {
  const { level, leveledUp, thisWeekActiveDays, currentStreak, longestStreak } =
    g;
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <TrendingUpIcon className="size-4" /> 성장
        </h2>
        <p className="text-muted-foreground text-xs">
          단원을 마스터할수록 단계가 올라가요 · 꾸준함은 이번 주 학습일로
          보여 드려요.
        </p>
      </div>
      <div className="space-y-3 px-6 pb-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-bold tracking-tight">{level.name}</span>
          <span className="text-muted-foreground text-xs">
            단계 {level.levelNumber}/5 · 마스터 {level.masteredCount}단원
          </span>
          {leveledUp ? (
            <Badge className="gap-1 bg-emerald-600 text-xs hover:bg-emerald-700">
              단계 상승!
            </Badge>
          ) : null}
        </div>
        {level.nextName ? (
          <p className="text-muted-foreground text-xs">
            <b className="text-foreground">{level.toNext}단원</b> 더 마스터하면{" "}
            <b className="text-foreground">{level.nextName}</b> 단계
          </p>
        ) : (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            최고 단계 통달 — 합격까지 쭉!
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <span>
            이번 주 <b>{thisWeekActiveDays}</b>일 학습
          </span>
          <span className="text-muted-foreground text-xs">
            🔥 현재 연속 {currentStreak}일 · 최장 {longestStreak}일
          </span>
        </div>
      </div>
    </Surface>
  );
}

// feat-2-027 Phase 3 — 공부량(자기성장 주축 + 코호트 구간 양념). ★순위 아님·격려·동의/표본 가드.
function StudyVolumeCard({
  g,
  cohort,
}: {
  g: StatsData["gamification"];
  cohort: StatsData["cohortStudyBand"];
}) {
  const thisWeekH = g.thisWeekStudyMs / 3_600_000;
  const delta = g.studyDeltaPct;
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <ClockIcon className="size-4" /> 공부량
        </h2>
        <p className="text-muted-foreground text-xs">
          이번 주 학습량과 지난주 대비 나의 성장 · 비교는 양념일 뿐.
        </p>
      </div>
      <div className="space-y-3 px-6 pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm">
            이번 주 <b className="text-lg">{thisWeekH.toFixed(1)}</b>h 학습
          </span>
          {delta === null ? (
            <span className="text-muted-foreground text-xs">
              다음 주부터 지난주 대비 성장이 보여요
            </span>
          ) : delta >= 0 ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              지난주 대비 +{delta}%
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              지난주 대비 {delta}%
            </span>
          )}
        </div>
        {cohort?.state === "ok" ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-sm">
            <span className="text-muted-foreground text-xs">우리 반에서</span>
            <Badge variant="secondary" className="text-xs">
              상위 {cohort.topPercent}% · {cohort.band}
            </Badge>
            <span className="text-muted-foreground text-xs">
              (동의 {cohort.sampleSize}명 기준)
            </span>
          </div>
        ) : cohort?.state === "locked" ? (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            우리 반 구간 비교는 동의한 동료 {cohort.needed}명이 모이면 자동으로
            열려요 (현재 {cohort.current}명).
          </p>
        ) : null}
      </div>
    </Surface>
  );
}

// 주별 학습시간 추이 — daily.days 주별 버킷(goals 에서 이관, range 연동).
function StudyTimeTrendCard({
  days,
  weekCount,
}: {
  days: Array<{ timeMs: number }>;
  weekCount: number;
}) {
  const n = Math.max(1, weekCount);
  const weeklyHours: number[] = [];
  for (let w = n - 1; w >= 0; w -= 1) {
    const end = days.length - w * 7;
    if (end <= 0) {
      weeklyHours.push(0);
      continue;
    }
    const start = Math.max(0, end - 7);
    const hours =
      days.slice(start, end).reduce((s, d) => s + d.timeMs, 0) / 3_600_000;
    weeklyHours.push(hours);
  }
  const maxWeek = Math.max(0.1, ...weeklyHours);
  const lastWeekHours = weeklyHours[weeklyHours.length - 1] ?? 0;
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
          <TrendingUpIcon className="size-4" /> 주별 학습시간
        </h2>
        <p className="text-muted-foreground text-xs">
          선택한 기간의 주별 문제 풀이 시간입니다 · 가장 오른쪽이 최근 주입니다.
        </p>
      </div>
      <div className="px-6 pb-6">
        <div className="flex h-24 items-end gap-1.5">
          {weeklyHours.map((h, i) => {
            const heightPct = (h / maxWeek) * 100;
            const isLast = i === weeklyHours.length - 1;
            return (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${h.toFixed(1)}시간`}
              >
                <div
                  className={cn(
                    "w-full rounded-sm",
                    isLast ? "bg-primary" : "bg-primary/40",
                  )}
                  style={{
                    height: `${Math.max(heightPct, h > 0 ? 6 : 0)}%`,
                    minHeight: h > 0 ? 4 : 0,
                  }}
                />
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          최근 주 {lastWeekHours.toFixed(1)}h
        </p>
      </div>
    </Surface>
  );
}

function OverviewTab({ data }: { data: StatsData }) {
  const {
    overall,
    kpis,
    aidCounts,
    daily,
    accuracyTrend,
    passTrend,
    heatmap,
    weakAreas,
    passerBenchmark,
    studyGoals,
    nodeMastery,
    gamification,
    cohortStudyBand,
    trainingStats,
  } = data;
  const totalHours = Math.round(kpis.totalProblemTimeMs / 1000 / 3600);
  const goalDday = studyGoals.examDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(studyGoals.examDate).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const goalDailyHourTarget = studyGoals.weeklyGoalHours / 7;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={BookOpenIcon}
          label="조문 열람"
          value={`${overall.articles.pct}%`}
          subtle={`${overall.articles.visited} / ${overall.articles.total}`}
        />
        <KpiCard
          icon={GavelIcon}
          label="판례 열람"
          value={`${overall.cases.pct}%`}
          subtle={`${overall.cases.visited} / ${overall.cases.total}`}
        />
        <KpiCard
          icon={ListChecksIcon}
          label="문제 풀이"
          value={`${overall.problems.pct}%`}
          subtle={`${overall.problems.attempted} / ${overall.problems.total} · 정답률 ${kpis.overallAccuracyPct}%`}
        />
        <KpiCard
          icon={CalendarIcon}
          label="연속 학습"
          value={`${daily.currentStreak}일`}
          subtle={`총 학습 ${totalHours}h · 활동일 ${daily.totalActiveDays}일`}
        />
      </div>

      <WeakReviewCard weakAreas={weakAreas} />

      <MilestonesCard overall={overall} />

      <MasteryCard rows={nodeMastery} />

      <GrowthCard g={gamification} />

      {/* feat-2-028 Stage 3 — 손공부(쟁점·목차 훈련) 지표. */}
      <TrainingCard t={trainingStats} />

      <StudyVolumeCard g={gamification} cohort={cohortStudyBand} />

      {passerBenchmark ? (
        <PasserCalibrationCard
          benchmark={passerBenchmark}
          dailyHourTarget={goalDailyHourTarget}
          totalDaysLeft={goalDday}
        />
      ) : null}

      {/* feat-2-013 학습 활동 히트맵 */}
      <Surface pad={0} tone="subtle">
        <div className="px-6 pt-6 pb-3">
          <h2 className="text-base font-bold tracking-tight">
            학습 활동 히트맵
          </h2>
          <p className="text-muted-foreground text-xs">
            최근 365일 · 요일·시간대 패턴까지 한눈에 볼 수 있습니다.
          </p>
        </div>
        <div className="px-6 pb-6">
          <ActivityHeatmap data={heatmap} />
        </div>
      </Surface>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TrendingDownIcon}
          label="오답 큐"
          value={String(aidCounts.wrongMcq + aidCounts.wrongOx)}
          subtle={`객관식 ${aidCounts.wrongMcq} · 정오문제 ${aidCounts.wrongOx}`}
          warn={aidCounts.wrongMcq + aidCounts.wrongOx > 0}
          to="/study/wrong-note"
        />
        <KpiCard
          icon={BookmarkIcon}
          label="즐겨찾기"
          value={String(aidCounts.bookmarks)}
          to="/study/bookmarks"
        />
        <KpiCard
          icon={StickyNoteIcon}
          label="포스트잇"
          value={String(aidCounts.memos)}
        />
        <KpiCard
          icon={HighlighterIcon}
          label="하이라이트"
          value={String(aidCounts.highlights)}
          to="/study/highlights"
        />
      </div>

      <AccuracyTrendCard weeks={accuracyTrend.weeks} />
      <StudyTimeTrendCard
        days={daily.days}
        weekCount={accuracyTrend.weeks.length}
      />
      <PassPredictionTrendCard items={passTrend} />
    </div>
  );
}

// ─── 차수 분기 헬퍼 ───

// ─── 진도 (과목 런처 — 카드형) ───

function ProgressTab({ data }: { data: StatsData }) {
  const {
    subjectsProgress,
    scienceProgress,
    subjectiveStats,
    articleStats,
    caseStats,
    weakAreas,
    lastPoints,
    daily,
    kpis,
    studyGoals,
    examRound,
  } = data;

  // 과목별 슬라이스를 lawCode 로 묶어 카드 1개당 통합 view model 로 만든다.
  const articleBy = new Map(articleStats.bySubject.map((r) => [r.lawCode, r]));
  const caseBy = new Map(caseStats.bySubject.map((r) => [r.lawCode, r]));
  const subjectiveBy = new Map(
    subjectiveStats.bySubject.map((r) => [r.lawCode, r]),
  );
  // 약점 — weakAreas(상위 N) 를 과목별로 집계한 경량 신호.
  const weakBy: Record<string, number> = {};
  for (const w of weakAreas) weakBy[w.lawCode] = (weakBy[w.lawCode] ?? 0) + 1;

  const subjects: LauncherSubject[] = subjectsProgress.map((sp) => {
    const a = articleBy.get(sp.lawCode);
    const c = caseBy.get(sp.lawCode);
    const sub = subjectiveBy.get(sp.lawCode);
    const exam = LAW_SUBJECTS[sp.lawCode].exam;
    const rounds: ("1" | "2")[] =
      exam === "both" ? ["1", "2"] : exam === "first" ? ["1"] : ["2"];
    return {
      slug: sp.lawCode,
      name: sp.name,
      group: LAW_SUBJECTS[sp.lawCode].categoryLabel,
      rounds,
      progressPct: sp.pctViewed,
      // 합격자 진도 벤치마크 데이터 연동 시 채움 — 값이 있으면 카드에 자동 표시(없으면 숨김).
      passerAvg: null,
      articles: { visited: sp.visitedCount, total: sp.totalArticleCount },
      cases: { visited: c?.visited ?? 0, total: c?.total ?? 0 },
      attempts: sp.problemsAttempted,
      accuracy: Math.round(sp.accuracyPct ?? 0),
      weak: weakBy[sp.lawCode] ?? 0,
      bookmarks: a?.bookmarks ?? 0,
      postits: a?.memos ?? 0,
      highlights: a?.highlights ?? 0,
      gs:
        sub && sub.attempts > 0
          ? { count: sub.attempts, selfAvg: Math.round(sub.avgSelfScore ?? 0) }
          : null,
      lastPoints: lastPoints[sp.lawCode] ?? [],
    };
  });

  const science: LauncherScience[] = scienceProgress.map((sp) => ({
    slug: sp.slug,
    name: sp.name,
    emoji: sp.emoji,
    progressPct: sp.total > 0 ? Math.round((sp.attempted / sp.total) * 100) : 0,
    attempts: sp.attempted,
    total: sp.total,
    accuracy: Math.round(sp.accuracyPct ?? 0),
    taken: sp.attempted > 0,
    href: `/subjects/science/${
      sp.slug === "earth_science" ? "earth-science" : sp.slug
    }`,
    lastPoint: null,
  }));

  return (
    <ProgressLauncher
      examRound={examRound}
      subjects={subjects}
      science={science}
      streak={daily.currentStreak}
      weekHours={kpis.last7d.totalProblemTimeMs / 3_600_000}
      weeklyGoalHours={studyGoals.weeklyGoalHours ?? null}
    />
  );
}

// ─── 약점 (내 오답 + 정오문제 약점 진단) ───

function WeaknessTab({ data }: { data: StatsData }) {
  const { weakAreas, aidCounts, oxDiagnosis, oxPasser, oxSessions } = data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TrendingDownIcon}
          label="오답 큐"
          value={String(aidCounts.wrongMcq + aidCounts.wrongOx)}
          subtle={`객관식 ${aidCounts.wrongMcq} · 정오문제 ${aidCounts.wrongOx}`}
          warn={aidCounts.wrongMcq + aidCounts.wrongOx > 0}
          to="/study/wrong-note"
        />
      </div>

      <Surface pad={0} tone="subtle" className="overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              약점 — 전체 정답률이 낮은 문제 + 내 오답
            </p>
            <Badge variant="outline" className="text-[10px]">
              상위 5건
            </Badge>
          </div>
        </div>
        {weakAreas.length === 0 ? (
          <EmptyMsg text="아직 표시할 약점이 없습니다 — 문제를 풀면 자동 수집됩니다." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>문제</TableHead>
                <TableHead className="w-20 text-xs">조문</TableHead>
                <TableHead className="w-20 text-right">전체 정답률</TableHead>
                <TableHead className="w-20 text-right">내 시도</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weakAreas.map((w) => (
                <TableRow key={w.problemId}>
                  <TableCell>
                    <p className="text-sm">{w.bodySnippet}</p>
                    <p className="text-muted-foreground text-xs">
                      {w.lawCode}
                      {w.year ? ` · ${w.year}` : ""}
                      {w.problemNumber ? ` · ${w.problemNumber}번` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">
                    {w.primaryArticleLabel ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {w.globalAccuracyPct === null
                      ? "—"
                      : `${w.globalAccuracyPct}%`}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {w.myAttempts}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/subjects/${w.lawCode}/problems/${w.problemId}`}
                      viewTransition
                      className="text-link inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      풀기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {weakAreas.length > 0 ? (
          <div className="px-6 pt-3 pb-4">
            <ReflectedInTodayNote />
          </div>
        ) : null}
      </Surface>

      {/* ox_diagnosis 매트릭스는 streaming defer — 약점 탭에서 스트리밍·로딩 표시.
          ?tab=ox_diagnosis 직접 진입도 로딩 후 동일 내용. */}
      <Suspense fallback={<OxDiagnosisLoading />}>
        <Await resolve={oxDiagnosis}>
          {(diag) => (
            <OxDiagnosisView
              diagnosis={diag}
              passer={oxPasser}
              audience="self"
            />
          )}
        </Await>
      </Suspense>

      {/* 정오문제 응시 이력 — compact(최근 3 + 전체 링크). 전체·필터·결과뷰는 /me/ox-sessions
          유지(자산 보존). OX 진단 매트릭스와 한 묶음(둘 다 정오문제). */}
      <OxHistoryCompact sessions={oxSessions} />
    </div>
  );
}

// 정오문제 응시 이력 compact — 약점 탭 편입(모의고사 nav "정오문제 응시 이력" 흡수).
function OxHistoryCompact({ sessions }: { sessions: StatsData["oxSessions"] }) {
  if (sessions.length === 0) return null;
  return (
    <Surface pad={0} tone="subtle">
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h2 className="text-sm font-bold tracking-tight">정오문제 응시 이력</h2>
        <Link
          to="/me/ox-sessions"
          className="text-link inline-flex items-center gap-1 text-xs hover:underline"
        >
          전체 이력 <ArrowRightIcon className="size-3" />
        </Link>
      </div>
      <ul className="divide-y px-6 pb-4">
        {sessions.slice(0, 3).map((s) => {
          const rate =
            s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          return (
            <li key={s.sessionId}>
              <Link
                to={`/me/ox-sessions/${s.sessionId}`}
                viewTransition
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                  {s.packTitle ?? "(문제집 삭제됨)"}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {(s.completedAt ?? s.startedAt).slice(0, 10)}
                  </span>
                  <Badge variant="outline" className="tabular-nums">
                    {rate}%
                  </Badge>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

function OxDiagnosisLoading() {
  return (
    <Surface pad={0} tone="subtle" className="px-6 py-12">
      <p className="text-muted-foreground text-center text-sm">
        정오문제 약점 분석을 불러오는 중…
      </p>
    </Surface>
  );
}

// ─── 공용 ───

function KpiCard({
  icon: Icon,
  label,
  value,
  subtle,
  warn,
  to,
}: {
  icon?: typeof PencilLineIcon;
  label: string;
  value: string;
  subtle?: string;
  warn?: boolean;
  /** 있으면 카드 전체가 해당 목록으로 가는 링크(#4 행동 연결). */
  to?: string;
}) {
  const body = (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="text-link size-4" /> : null}
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
      <p
        className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}
      >
        {value}
      </p>
      {subtle ? (
        <p className="text-muted-foreground text-xs">{subtle}</p>
      ) : null}
    </div>
  );
  if (to) {
    return (
      <Surface
        pad={0}
        tone="subtle"
        className="hover:border-primary/30 hover:bg-muted/40 transition-colors"
      >
        <Link to={to} viewTransition className="block px-5 py-4">
          {body}
        </Link>
      </Surface>
    );
  }
  return (
    <Surface pad={0} tone="subtle" className="px-5 py-4">
      {body}
    </Surface>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground px-6 py-6 text-center text-sm">
      {text}
    </p>
  );
}

// feat-2-008 #3 — 통계 약점이 추천(오늘 할 일)과 같은 소스(getWeakAreas)임을
// 학생이 인지하도록 하는 경량 교차 안내. 행별 정확 매칭 아님(섹션 단위).
function ReflectedInTodayNote() {
  return (
    <Link
      to="/study/today"
      viewTransition
      className="text-muted-foreground hover:text-link inline-flex items-center gap-1 text-[11px]"
    >
      <ListChecksIcon className="size-3" />이 약점은 ‘오늘 할 일’ 추천에도
      반영됩니다
      <ArrowRightIcon className="size-3" />
    </Link>
  );
}

// feat-2-008 #1 — 한눈에 탭 상단 "약점 → 지금 복습" 카드.
// 이미 loader 가 가진 weakAreas 재사용(새 쿼리 0). 복습 시작 = 오답노트(약점=오답
// 정확히 일치·항상 내용 있음). 행별 "풀기" 는 그 문제로 직접 점프.
function WeakReviewCard({ weakAreas }: { weakAreas: StatsData["weakAreas"] }) {
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="inline-flex items-center gap-1.5 text-base font-bold tracking-tight">
              <TrendingDownIcon className="size-4 text-amber-600" />
              약점 복습
            </h2>
            <p className="text-muted-foreground text-xs">
              최근 오답이면서 전체 정답률이 낮은 문제부터. 바로 풀어 보세요.
            </p>
          </div>
          {weakAreas.length > 0 ? (
            <Button size="sm" asChild>
              <Link to="/study/wrong-note" viewTransition>
                복습 시작 <ArrowRightIcon className="size-3" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 px-6 pb-6">
        {weakAreas.length === 0 ? (
          <EmptyMsg text="아직 표시할 약점이 없습니다 — 문제를 풀면 자동 수집됩니다." />
        ) : (
          <>
            <ul className="divide-y">
              {weakAreas.slice(0, 3).map((w) => (
                <li
                  key={w.problemId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{w.bodySnippet}</p>
                    <p className="text-muted-foreground text-xs">
                      {w.lawCode}
                      {w.year ? ` · ${w.year}` : ""}
                      {w.globalAccuracyPct !== null
                        ? ` · 전체 정답률 ${w.globalAccuracyPct}%`
                        : ""}
                    </p>
                  </div>
                  <Link
                    to={`/subjects/${w.lawCode}/problems/${w.problemId}`}
                    viewTransition
                    className="text-link inline-flex shrink-0 items-center gap-1 text-xs hover:underline"
                  >
                    풀기 <ArrowRightIcon className="size-3" />
                  </Link>
                </li>
              ))}
            </ul>
            <ReflectedInTodayNote />
          </>
        )}
      </div>
    </Surface>
  );
}

// 성과 막대 색(정답률 추이·합격예측 추이)은 scoreBgTone(~/core/lib/chart-colors) 공유 — SSOT.

function PassPredictionTrendCard({
  items,
}: {
  items: PassPredictionSnapshotItem[];
}) {
  if (items.length === 0) {
    return (
      <Surface pad={0} tone="subtle">
        <div className="px-6 pt-6 pb-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 예측 점수 추이
          </p>
        </div>
        <div className="px-6 pb-6">
          <p className="text-muted-foreground text-center text-xs">
            아직 기록이 없습니다. 매일 자동으로 쌓입니다.
          </p>
        </div>
      </Surface>
    );
  }
  const latest = items[items.length - 1];
  const oldest = items[0];
  const delta = latest.score - oldest.score;
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 예측 점수 추이 ({items.length}일)
          </p>
          <Badge variant="outline" className="text-[10px]">
            현재 {latest.score} · 시작 {oldest.score} ·{" "}
            <span
              className={cn(
                delta > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "",
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </Badge>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="flex items-end gap-1">
          {items.map((it) => (
            <div
              key={it.snapshotDate}
              className="flex flex-1 flex-col gap-1"
              title={`${it.snapshotDate} · ${it.score}점 (${it.rating})`}
            >
              <div className="bg-muted/40 relative flex h-20 items-end overflow-hidden rounded">
                <div
                  className={cn("w-full transition-all", scoreBgTone(it.score))}
                  style={{ height: `${Math.max(2, it.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  );
}

function AccuracyTrendCard({ weeks }: { weeks: UserWeeklyAccuracyItem[] }) {
  if (weeks.length === 0) return null;
  const allEmpty = weeks.every((w) => w.totalAttempts === 0);
  return (
    <Surface pad={0} tone="subtle">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            최근 {weeks.length}주 정답률 추이
          </p>
          <Badge variant="outline" className="text-[10px]">
            주별 시도/정답률
          </Badge>
        </div>
      </div>
      <div className="px-6 pb-6">
        {allEmpty ? (
          <p className="text-muted-foreground text-center text-xs">
            아직 충분한 시도 데이터가 없습니다.
          </p>
        ) : (
          <div className="flex items-end gap-1.5">
            {weeks.map((w) => {
              const height = w.accuracyPct ?? 0;
              return (
                <div
                  key={w.weekStart}
                  className="flex flex-1 flex-col gap-1"
                  title={`${w.label} · ${w.totalAttempts}건 · ${w.accuracyPct ?? 0}%`}
                >
                  <div className="bg-muted/40 relative flex h-20 items-end overflow-hidden rounded">
                    <div
                      className={cn(
                        "w-full transition-all",
                        scoreBgTone(w.accuracyPct),
                      )}
                      style={{ height: `${Math.max(2, height)}%` }}
                    />
                  </div>
                  <div className="text-center text-[10px] tabular-nums">
                    {w.accuracyPct === null ? "—" : `${w.accuracyPct}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Surface>
  );
}

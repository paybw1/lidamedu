// feat-2-008 — 통합 학습 통계 페이지 (/study/stats)
// 6 탭: 한눈에 / 조문 / 판례 / 객관식 / 주관식 / 빈칸·암기.
// 각 탭은 서버 loader 가 일괄 fetch 한 데이터에서 슬라이스만 렌더.
import type { Route } from "./+types/stats";

import {
  ArrowRightIcon,
  BookOpenIcon,
  BookmarkIcon,
  BrainIcon,
  CalendarIcon,
  FlaskConicalIcon,
  GavelIcon,
  HighlighterIcon,
  ListChecksIcon,
  PencilLineIcon,
  StickyNoteIcon,
  TargetIcon,
  TrendingDownIcon,
} from "lucide-react";
import { Link, data, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
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
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { BlankStatsTabs } from "~/features/blanks/components/blank-stats-tabs";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";
import {
  type PassPredictionSnapshotItem,
  type UserWeeklyAccuracyItem,
  getAllSubjectsProgress,
  getArticleStudyStats,
  getCaseStudyStats,
  getDailyStudyStats,
  getDashboardKpis,
  getOverallProgress,
  getStudyAidCounts,
  getUserAccuracyTrend,
  getUserPassPredictionTrend,
  getUserSubjectiveStats,
  getWeakAreas,
} from "~/features/study/queries.server";
import {
  ALL_RANGE_SELECTION,
  RangeSelectionGroup,
  type RangeSelection,
} from "~/features/study/components/study-aids-list";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

const TAB_VALUES = ["overview", "first_exam", "second_exam", "blanks"] as const;
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
  { title: "학습 통계 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const rangeSel = parseRangeSelection(url.searchParams);

  // 시계열 차트 인자.
  const tsKey: RangeValue = rangeSel.kind === "preset" ? rangeSel.preset : "all";
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
    rangeSel.kind === "custom"
      ? { since, until }
      : { daysBack: dailyDays };
  const trendOpts =
    rangeSel.kind === "custom"
      ? { since, until }
      : { weekCount: trendWeeks };
  const passOpts =
    rangeSel.kind === "custom"
      ? { since, until }
      : { days: passDays };

  const lawCodes = LAW_SUBJECT_SLUGS.map((s) => ({
    slug: s,
    name: LAW_SUBJECTS[s].name,
  }));

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
  ]);
  const passTrend = await getUserPassPredictionTrend(client, user.id, passOpts);

  return {
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
    blanks: {
      content: blankContent,
      subject: blankSubject,
      period: blankPeriod,
      recitation,
    },
  };
}

export default function StudyStats({ loaderData }: Route.ComponentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabValue = isTabValue(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabValue)
    : DEFAULT_TAB;
  const rangeSel: RangeSelection = loaderData.rangeSel;

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
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          학습관리
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">학습 통계</h1>
            <p className="text-muted-foreground text-sm">
              1차 · 2차 차수별로 조문 · 판례 · 문제까지 드릴다운
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard" viewTransition>
                대시보드
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/goals" viewTransition>
                학습목표 ·진도
              </Link>
            </Button>
          </div>
        </div>

        {/* 기간 preset/custom — 정답률·시도수·약점 등 누적 통계와 시계열 차트에 적용.
            진도(% 완료) 와 학습한 조문·판례 수는 항상 전체 기준. */}
        <div className="border-border bg-muted/30 mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <RangeSelectionGroup value={rangeSel} onChange={setRange} />
          <p className="text-muted-foreground ml-auto text-[11px] leading-relaxed">
            기간 안 학습 활동·시도·약점 모두 반영. 진도(% 완료) 만 누적 기준
            유지.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">한눈에</TabsTrigger>
          <TabsTrigger value="first_exam">
            1차 통계{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {loaderData.kpis.totalProblemsAttempted}
            </span>
          </TabsTrigger>
          <TabsTrigger value="second_exam">
            2차 통계{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {loaderData.subjectiveStats.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="blanks">
            빈칸·암기{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {loaderData.blanks.content.totalAttempts +
                loaderData.blanks.subject.totalAttempts +
                loaderData.blanks.period.totalAttempts +
                loaderData.blanks.recitation.totalAttempts}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={loaderData} />
        </TabsContent>
        <TabsContent value="first_exam">
          <FirstExamTab data={loaderData} />
        </TabsContent>
        <TabsContent value="second_exam">
          <SecondExamTab data={loaderData} />
        </TabsContent>
        <TabsContent value="blanks">
          <BlankStatsTabs
            content={loaderData.blanks.content}
            subject={loaderData.blanks.subject}
            period={loaderData.blanks.period}
            recitation={loaderData.blanks.recitation}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── 한눈에 ───

function OverviewTab({ data }: { data: Route.ComponentProps["loaderData"] }) {
  const {
    overall,
    kpis,
    aidCounts,
    subjectsProgress,
    subjectiveStats,
    daily,
    scienceProgress,
    accuracyTrend,
    passTrend,
  } = data;
  const totalHours = Math.round(kpis.totalProblemTimeMs / 1000 / 3600);
  const firstExamSubjects = subjectsProgress.filter(
    (s) => LAW_SUBJECTS[s.lawCode].exam !== "second",
  );
  const secondExamSubjects = subjectiveStats.bySubject.filter(
    (s) => LAW_SUBJECTS[s.lawCode].exam !== "first",
  );
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TrendingDownIcon}
          label="오답 큐"
          value={String(aidCounts.wrongMcq + aidCounts.wrongOx)}
          subtle={`객관식 ${aidCounts.wrongMcq} · OX ${aidCounts.wrongOx}`}
          warn={aidCounts.wrongMcq + aidCounts.wrongOx > 0}
        />
        <KpiCard
          icon={BookmarkIcon}
          label="즐겨찾기"
          value={String(aidCounts.bookmarks)}
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
        />
      </div>

      <AccuracyTrendCard weeks={accuracyTrend.weeks} />
      <PassPredictionTrendCard items={passTrend} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              1차 통계 — 법률 {firstExamSubjects.length}과목
            </p>
            <Badge variant="outline" className="text-[10px]">
              객관식 · 조문 열람 + 정답률
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">조문 열람</TableHead>
                <TableHead className="w-20 text-right">문제</TableHead>
                <TableHead className="w-20 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {firstExamSubjects.map((row) => (
                <TableRow key={row.lawCode}>
                  <TableCell className="text-sm font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.pctViewed}%{" "}
                    <span className="text-muted-foreground text-xs">
                      ({row.visitedCount}/{row.totalArticleCount})
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.problemsAttempted}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.accuracyPct === null ? "—" : `${row.accuracyPct}%`}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/subjects/${row.lawCode}`}
                      viewTransition
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      가기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              1차 통계 — 자연과학 4과목
            </p>
            <Badge variant="outline" className="text-[10px]">
              객관식 · 풀이 + 정답률
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">풀이</TableHead>
                <TableHead className="w-24 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scienceProgress.map((row) => {
                const slugUrl =
                  row.slug === "earth_science" ? "earth-science" : row.slug;
                return (
                  <TableRow
                    key={row.slug}
                    className={row.total === 0 ? "opacity-50" : ""}
                  >
                    <TableCell className="text-sm font-medium">
                      <span className="mr-1">{row.emoji}</span>
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.attempted}{" "}
                      <span className="text-muted-foreground text-xs">
                        / {row.total}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.accuracyPct === null ? "—" : `${row.accuracyPct}%`}
                    </TableCell>
                    <TableCell>
                      {row.total > 0 ? (
                        <Link
                          to={`/subjects/science/${slugUrl}`}
                          viewTransition
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          가기 <ArrowRightIcon className="size-3" />
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              2차 통계 — 법률 {secondExamSubjects.length}과목
            </p>
            <Badge variant="outline" className="text-[10px]">
              주관식 · 답안 + 자기채점
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">답안</TableHead>
                <TableHead className="w-28 text-right">평균 자기채점</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secondExamSubjects.map((row) => (
                <TableRow key={row.lawCode}>
                  <TableCell className="text-sm font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.attempts}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.avgSelfScore === null ? "—" : `${row.avgSelfScore}점`}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/subjects/${row.lawCode}?tab=problems`}
                      viewTransition
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      가기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 차수 분기 헬퍼 ───

type FirstSubject<T extends { lawCode: LawSubjectSlug }> = T;
function isFirstExamSubject<T extends { lawCode: LawSubjectSlug }>(
  r: T,
): r is FirstSubject<T> {
  return LAW_SUBJECTS[r.lawCode].exam !== "second";
}
function isSecondExamSubject<T extends { lawCode: LawSubjectSlug }>(
  r: T,
): r is T {
  return LAW_SUBJECTS[r.lawCode].exam !== "first";
}

// ─── 조문/판례 sub-section (1차·2차 탭 공용) ───

function ArticlesSection({
  rows,
}: {
  rows: Route.ComponentProps["loaderData"]["articleStats"]["bySubject"];
}) {
  const summary = rows.reduce(
    (acc, r) => ({
      visited: acc.visited + r.visited,
      total: acc.total + r.total,
      bookmarks: acc.bookmarks + r.bookmarks,
      memos: acc.memos + r.memos,
      highlights: acc.highlights + r.highlights,
    }),
    { visited: 0, total: 0, bookmarks: 0, memos: 0, highlights: 0 },
  );
  const pct =
    summary.total > 0 ? Math.round((summary.visited / summary.total) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            조문 학습
          </p>
          <Badge variant="outline" className="text-[10px]">
            열람 {summary.visited} / {summary.total} ({pct}%) · 즐겨찾기{" "}
            {summary.bookmarks} · 포스트잇 {summary.memos} · 하이라이트{" "}
            {summary.highlights}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>과목</TableHead>
              <TableHead className="w-24 text-right">열람</TableHead>
              <TableHead className="w-20 text-right">즐겨찾기</TableHead>
              <TableHead className="w-20 text-right">포스트잇</TableHead>
              <TableHead className="w-20 text-right">하이라이트</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.lawCode}>
                <TableCell className="text-sm font-medium">
                  {row.name}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.visited}{" "}
                  <span className="text-muted-foreground text-xs">
                    / {row.total}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.bookmarks}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.memos}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.highlights}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/subjects/${row.lawCode}`}
                    viewTransition
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    가기 <ArrowRightIcon className="size-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CasesSection({
  rows,
}: {
  rows: Route.ComponentProps["loaderData"]["caseStats"]["bySubject"];
}) {
  const summary = rows.reduce(
    (acc, r) => ({
      visited: acc.visited + r.visited,
      total: acc.total + r.total,
    }),
    { visited: 0, total: 0 },
  );
  const pct =
    summary.total > 0 ? Math.round((summary.visited / summary.total) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            판례 학습
          </p>
          <Badge variant="outline" className="text-[10px]">
            열람 {summary.visited} / {summary.total} ({pct}%)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>과목</TableHead>
              <TableHead className="w-24 text-right">열람</TableHead>
              <TableHead className="w-24 text-right">전체</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.lawCode}>
                <TableCell className="text-sm font-medium">
                  {row.name}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.visited}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.total}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/subjects/${row.lawCode}?tab=cases`}
                    viewTransition
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    가기 <ArrowRightIcon className="size-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── 1차 통계 (조문 + 판례 + 객관식) ───

function FirstExamTab({ data }: { data: Route.ComponentProps["loaderData"] }) {
  const {
    subjectsProgress,
    scienceProgress,
    weakAreas,
    kpis,
    aidCounts,
    articleStats,
    caseStats,
  } = data;
  const firstLaw = subjectsProgress.filter(isFirstExamSubject);
  const firstArticles = articleStats.bySubject.filter(isFirstExamSubject);
  const firstCases = caseStats.bySubject.filter(isFirstExamSubject);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ListChecksIcon}
          label="시도 문제"
          value={String(kpis.totalProblemsAttempted)}
          subtle={`최근 7일 ${kpis.last7d.totalProblemsAttempted}건`}
        />
        <KpiCard
          icon={TargetIcon}
          label="정답률"
          value={`${kpis.overallAccuracyPct}%`}
        />
        <KpiCard
          icon={TrendingDownIcon}
          label="오답 큐"
          value={String(aidCounts.wrongMcq + aidCounts.wrongOx)}
          subtle={`객관식 ${aidCounts.wrongMcq} · OX ${aidCounts.wrongOx}`}
          warn={aidCounts.wrongMcq + aidCounts.wrongOx > 0}
        />
        <KpiCard
          icon={CalendarIcon}
          label="누적 풀이 시간"
          value={`${Math.round(kpis.totalProblemTimeMs / 1000 / 3600)}h`}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              법률 객관식 — {firstLaw.length}과목
            </p>
            <Link
              to="/study/wrong-note"
              viewTransition
              className="text-primary text-xs hover:underline"
            >
              오답노트 →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">시도</TableHead>
                <TableHead className="w-24 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {firstLaw.map((row) => (
                <TableRow key={row.lawCode}>
                  <TableCell className="text-sm font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.problemsAttempted}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.accuracyPct === null ? "—" : `${row.accuracyPct}%`}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/subjects/${row.lawCode}?tab=problems`}
                      viewTransition
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      풀기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            자연과학 객관식 — 4과목
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">풀이</TableHead>
                <TableHead className="w-24 text-right">정답률</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scienceProgress.map((row) => {
                const slugUrl =
                  row.slug === "earth_science" ? "earth-science" : row.slug;
                return (
                  <TableRow
                    key={row.slug}
                    className={row.total === 0 ? "opacity-50" : ""}
                  >
                    <TableCell className="text-sm font-medium">
                      <span className="mr-1">{row.emoji}</span>
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.attempted}{" "}
                      <span className="text-muted-foreground text-xs">
                        / {row.total}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.accuracyPct === null ? "—" : `${row.accuracyPct}%`}
                    </TableCell>
                    <TableCell>
                      {row.total > 0 ? (
                        <Link
                          to={`/subjects/science/${slugUrl}`}
                          viewTransition
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          가기 <ArrowRightIcon className="size-3" />
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ArticlesSection rows={firstArticles} />
      <CasesSection rows={firstCases} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              약점 — 어려운 글로벌 + 내 오답
            </p>
            <Badge variant="outline" className="text-[10px]">
              상위 5건
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {weakAreas.length === 0 ? (
            <EmptyMsg text="아직 표시할 약점이 없습니다 — 문제를 풀면 자동 수집됩니다." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>문제</TableHead>
                  <TableHead className="w-20 text-xs">조문</TableHead>
                  <TableHead className="w-20 text-right">글로벌</TableHead>
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
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        풀기 <ArrowRightIcon className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 2차 통계 (조문 + 판례 + 주관식) ───

function SecondExamTab({ data }: { data: Route.ComponentProps["loaderData"] }) {
  const { subjectiveStats, articleStats, caseStats } = data;
  const secondLaw = subjectiveStats.bySubject.filter(isSecondExamSubject);
  const secondArticles = articleStats.bySubject.filter(isSecondExamSubject);
  const secondCases = caseStats.bySubject.filter(isSecondExamSubject);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={PencilLineIcon}
          label="총 답안"
          value={String(subjectiveStats.totalAttempts)}
          subtle={`제출 ${subjectiveStats.submittedAttempts}`}
        />
        <KpiCard
          icon={TargetIcon}
          label="평균 자기채점"
          value={
            subjectiveStats.avgSelfScore === null
              ? "—"
              : `${subjectiveStats.avgSelfScore}점`
          }
        />
        <KpiCard
          icon={FlaskConicalIcon}
          label="첨삭 대기"
          value={String(subjectiveStats.reviewRequested)}
          warn={subjectiveStats.reviewRequested > 0}
        />
        <KpiCard
          icon={TargetIcon}
          label="첨삭 완료"
          value={String(subjectiveStats.reviewCompleted)}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              법률 주관식 — {secondLaw.length}과목
            </p>
            <Link
              to="/latest/essay"
              viewTransition
              className="text-primary text-xs hover:underline"
            >
              주관식 색인 →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="w-24 text-right">답안</TableHead>
                <TableHead className="w-28 text-right">평균 자기채점</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secondLaw.map((row) => (
                <TableRow key={row.lawCode}>
                  <TableCell className="text-sm font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.attempts}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.avgSelfScore === null ? "—" : `${row.avgSelfScore}점`}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/subjects/${row.lawCode}?tab=problems`}
                      viewTransition
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      가기 <ArrowRightIcon className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ArticlesSection rows={secondArticles} />
      <CasesSection rows={secondCases} />
    </div>
  );
}

// ─── 공용 ───

function KpiCard({
  icon: Icon,
  label,
  value,
  subtle,
  warn,
}: {
  icon?: typeof PencilLineIcon;
  label: string;
  value: string;
  subtle?: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="text-primary size-4" /> : null}
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
      </CardContent>
    </Card>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground px-6 py-6 text-center text-sm">
      {text}
    </p>
  );
}

// feat-7-024 정밀화 — 본인 주별 정답률 추이
function accuracyTrendBgTone(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/30";
  if (pct >= 80) return "bg-emerald-500/80";
  if (pct >= 60) return "bg-lime-500/80";
  if (pct >= 40) return "bg-amber-500/80";
  if (pct >= 20) return "bg-orange-500/80";
  return "bg-rose-500/80";
}

// feat-7-027 — 합격 진단 점수 추이 (최근 30일)
function passScoreBgTone(score: number): string {
  if (score >= 80) return "bg-emerald-500/80";
  if (score >= 60) return "bg-lime-500/80";
  if (score >= 40) return "bg-amber-500/80";
  if (score >= 20) return "bg-orange-500/80";
  return "bg-rose-500/80";
}

function PassPredictionTrendCard({
  items,
}: {
  items: PassPredictionSnapshotItem[];
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 진단 점수 추이
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center text-xs">
            아직 스냅샷이 없습니다. 매일 자동 누적됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }
  const latest = items[items.length - 1];
  const oldest = items[0];
  const delta = latest.score - oldest.score;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            합격 진단 점수 추이 ({items.length}일)
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
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1">
          {items.map((it) => (
            <div
              key={it.snapshotDate}
              className="flex flex-1 flex-col gap-1"
              title={`${it.snapshotDate} · ${it.score}점 (${it.rating})`}
            >
              <div className="bg-muted/40 relative flex h-20 items-end overflow-hidden rounded">
                <div
                  className={cn(
                    "w-full transition-all",
                    passScoreBgTone(it.score),
                  )}
                  style={{ height: `${Math.max(2, it.score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AccuracyTrendCard({ weeks }: { weeks: UserWeeklyAccuracyItem[] }) {
  if (weeks.length === 0) return null;
  const allEmpty = weeks.every((w) => w.totalAttempts === 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            최근 {weeks.length}주 정답률 추이
          </p>
          <Badge variant="outline" className="text-[10px]">
            주별 시도/정답률
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
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
                        accuracyTrendBgTone(w.accuracyPct),
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
      </CardContent>
    </Card>
  );
}

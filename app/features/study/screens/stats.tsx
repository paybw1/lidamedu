// feat-2-008 — 통합 학습 통계 페이지 (/study/stats)
// 6 탭: 한눈에 / 조문 / 판례 / 객관식 / 주관식 / 빈칸·암기.
// 각 탭은 서버 loader 가 일괄 fetch 한 데이터에서 슬라이스만 렌더.

import {
  ArrowRightIcon,
  BookmarkIcon,
  BookOpenIcon,
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

import { BlankStatsTabs } from "~/features/blanks/components/blank-stats-tabs";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import { getAllScienceSubjectsProgress } from "~/features/subjects/lib/science.server";
import {
  getAllSubjectsProgress,
  getArticleStudyStats,
  getCaseStudyStats,
  getDailyStudyStats,
  getDashboardKpis,
  getOverallProgress,
  getStudyAidCounts,
  getUserSubjectiveStats,
  getWeakAreas,
} from "~/features/study/queries.server";

import type { Route } from "./+types/stats";

const TAB_VALUES = [
  "overview",
  "first_exam",
  "second_exam",
  "blanks",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

const DEFAULT_TAB: TabValue = "overview";

function isTabValue(v: string | null): v is TabValue {
  return v !== null && (TAB_VALUES as readonly string[]).includes(v);
}

export const meta: Route.MetaFunction = () => [
  { title: "학습 통계 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

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
  ] = await Promise.all([
    getOverallProgress(client, user.id),
    getDashboardKpis(client, user.id),
    getStudyAidCounts(client, user.id),
    getAllSubjectsProgress(client, user.id, lawCodes),
    getDailyStudyStats(client, user.id, 84),
    getArticleStudyStats(client, user.id, lawCodes),
    getCaseStudyStats(client, user.id, lawCodes),
    getUserSubjectiveStats(client, user.id, lawCodes),
    getAllScienceSubjectsProgress(client, user.id),
    getWeakAreas(client, user.id, 5),
    getUserBlankStats(client, user.id),
    getUserAutoBlankStats(client, user.id, "subject"),
    getUserAutoBlankStats(client, user.id, "period"),
    getUserRecitationStats(client, user.id),
  ]);

  return {
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

function OverviewTab({
  data,
}: {
  data: Route.ComponentProps["loaderData"];
}) {
  const {
    overall,
    kpis,
    aidCounts,
    subjectsProgress,
    subjectiveStats,
    daily,
    scienceProgress,
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
          label="메모"
          value={String(aidCounts.memos)}
        />
        <KpiCard
          icon={HighlighterIcon}
          label="하이라이트"
          value={String(aidCounts.highlights)}
        />
      </div>

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
              1차 통계 — 자연과학 4과목 (선택)
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
                    {row.avgSelfScore === null
                      ? "—"
                      : `${row.avgSelfScore}점`}
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
function isFirstExamSubject<T extends { lawCode: LawSubjectSlug }>(r: T): r is FirstSubject<T> {
  return LAW_SUBJECTS[r.lawCode].exam !== "second";
}
function isSecondExamSubject<T extends { lawCode: LawSubjectSlug }>(r: T): r is T {
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
            {summary.bookmarks} · 메모 {summary.memos} · 하이라이트{" "}
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
              <TableHead className="w-20 text-right">메모</TableHead>
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

function FirstExamTab({
  data,
}: {
  data: Route.ComponentProps["loaderData"];
}) {
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
            자연과학 객관식 — 선택 1과목
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

function SecondExamTab({
  data,
}: {
  data: Route.ComponentProps["loaderData"];
}) {
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

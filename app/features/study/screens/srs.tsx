// feat-2-010 SRS 큐 화면 — /study/srs.
// 본인 객관식 SRS due 항목 list + KPI.

import type { Route } from "./+types/srs";

import {
  ArrowRightIcon,
  CalendarClockIcon,
  HistoryIcon,
  RepeatIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";

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
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  type DueBlankSetItem,
  getBlankSrsCounts,
  getDueBlankSets,
} from "~/features/blanks/srs.server";
import {
  type DueArticleReviewItem,
  getArticleReviewCounts,
  getDueArticleReviews,
} from "~/features/study/article-review.server";
import {
  type DueOxRefItem,
  getDueOxRefs,
  getOxSrsCounts,
} from "~/features/study/ox-srs.server";
import {
  type PasserSrsBenchmark,
  type SrsRowMetric,
  getPasserSrsBenchmark,
} from "~/features/study/passer-srs-benchmark.server";
import {
  type SrsTrend,
  getSrsTrend,
} from "~/features/study/srs-trend.server";
import {
  getDueProblems,
  getSrsCounts,
} from "~/features/study/srs.server";

export const meta: Route.MetaFunction = () => [
  { title: "SRS 복습 큐 | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/study/srs");
  const [
    items,
    counts,
    blankItems,
    blankCounts,
    oxItems,
    oxCounts,
    articleItems,
    articleCounts,
    passerBenchmark,
    trend,
  ] = await Promise.all([
    getDueProblems(client, user.id, 100),
    getSrsCounts(client, user.id),
    getDueBlankSets(client, user.id, 50),
    getBlankSrsCounts(client, user.id),
    getDueOxRefs(client, user.id, 100),
    getOxSrsCounts(client, user.id),
    getDueArticleReviews(client, user.id, 50),
    getArticleReviewCounts(client, user.id),
    // 게이트 OFF (1년차) — 합격자 SRS 비교 자체를 비활성화.
    (async () => {
      const { isPasserBenchmarkEnabled } = await import(
        "~/features/exam-results/passer-benchmark-gate.server"
      );
      const gate = await isPasserBenchmarkEnabled();
      return gate.enabled
        ? getPasserSrsBenchmark(user.id, { excludeSynthetic: true })
        : null;
    })(),
    getSrsTrend(client, user.id, 30),
  ]);
  return {
    items,
    counts,
    blankItems,
    blankCounts,
    oxItems,
    oxCounts,
    articleItems,
    articleCounts,
    passerBenchmark,
    trend,
  };
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diffMs / 86_400_000);
  if (day < -1) return `${-day}일 후`;
  if (day === -1) return "내일";
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  return `${day}일 전`;
}

export default function StudySrs({ loaderData }: Route.ComponentProps) {
  const {
    items,
    counts,
    blankItems,
    blankCounts,
    oxItems,
    oxCounts,
    articleItems,
    articleCounts,
    passerBenchmark,
    trend,
  } = loaderData;
  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 md:px-6 md:py-12">
      <header className="mb-6">
        <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          <RepeatIcon className="size-3" /> SRS · 자동 복습
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          SRS 복습 큐
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          틀리면 1일·맞으면 3·7·14·30·60일 간격으로 자동 큐잉. 시스템이 망각
          곡선을 따라 지금 봐야 할 객관식 문제와 빈칸을 끌어옵니다.
        </p>
      </header>

      {/* feat-2-020 SRS 처리 추이 */}
      <SrsTrendChart trend={trend} />

      {/* ── 객관식 SRS 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        객관식 문제
      </p>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 due"
          value={counts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 내 도래"
          value={counts.upcoming7d}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 보유 항목"
          value={counts.total}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="누적 실패"
          value={counts.lapsesSum}
          tone="neutral"
        />
      </div>

      {/* 빈 상태 */}
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-3 py-12 text-center">
            <RepeatIcon className="mx-auto size-8 opacity-30" />
            <p className="text-sm font-medium">
              {counts.total === 0
                ? "아직 SRS 항목이 없습니다."
                : "지금 due 인 항목이 없습니다."}
            </p>
            <p className="text-xs">
              {counts.total === 0
                ? "문제를 한 번 시도하면 자동으로 SRS 큐에 들어갑니다."
                : `다음 도래까지 7일 내 ${counts.upcoming7d}건.`}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/study/today">오늘의 학습 메뉴</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/study/stats">학습 통계</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <p className="text-foreground text-sm font-bold">
              지금 풀어야 할 문제 {items.length}건
            </p>
            <p className="text-muted-foreground text-xs">
              가장 오래 미룬 항목 먼저. 클릭해 풀면 자동으로 SRS 상태 갱신.
            </p>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">문제</TableHead>
                    <TableHead className="w-[10%]">과목</TableHead>
                    <TableHead className="w-[10%] text-right">
                      간격
                    </TableHead>
                    <TableHead className="w-[10%] text-right">실패</TableHead>
                    <TableHead className="w-[15%] text-right">due</TableHead>
                    <TableHead className="w-[15%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.problemId}>
                      <TableCell>
                        <p className="text-foreground line-clamp-2 text-xs leading-relaxed">
                          {it.bodySnippet}
                          {it.bodySnippet.length === 100 ? "…" : ""}
                        </p>
                        {it.primaryArticleLabel ? (
                          <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                            {it.primaryArticleLabel}
                            {it.year ? ` · ${it.year}` : ""}
                            {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {it.lawCode}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {it.intervalDays}d
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-xs tabular-nums",
                          it.lapses > 2
                            ? "text-rose-700 dark:text-rose-300"
                            : "",
                        )}
                      >
                        {it.lapses}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                        {fmtRelative(it.nextDueAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            to={`/subjects/${it.lawCode}/problems/${it.problemId}`}
                            viewTransition
                          >
                            풀기 <ArrowRightIcon className="size-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 빈칸 SRS 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        빈칸 학습
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="due 세트"
          value={blankCounts.dueSets}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="due 빈칸"
          value={blankCounts.dueBlanks}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 보유 빈칸"
          value={blankCounts.totalBlanks}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="누적 실패"
          value={blankCounts.lapsesSum}
          tone="neutral"
        />
      </div>

      {blankItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-2 py-8 text-center text-xs">
            <RepeatIcon className="mx-auto size-6 opacity-30" />
            <p>
              {blankCounts.totalBlanks === 0
                ? "아직 빈칸 SRS 항목이 없습니다. 빈칸 세트를 한 번 시도하면 자동으로 큐에 들어갑니다."
                : `지금 due 인 빈칸이 없습니다. 7일 내 ${blankCounts.upcoming7dSets} 세트 도래.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <p className="text-foreground text-sm font-bold">
              지금 풀어야 할 빈칸 {blankCounts.dueSets} 세트 · 빈칸{" "}
              {blankCounts.dueBlanks}개
            </p>
          </CardHeader>
          <CardContent className="pb-3">
            <BlankSrsTable items={blankItems} />
          </CardContent>
        </Card>
      )}

      {/* ── OX SRS 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        OX 채점
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="due ref"
          value={oxCounts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 내 도래"
          value={oxCounts.upcoming7d}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 보유 ref"
          value={oxCounts.total}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="누적 실패"
          value={oxCounts.lapsesSum}
          tone="neutral"
        />
      </div>

      {oxItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-2 py-8 text-center text-xs">
            <RepeatIcon className="mx-auto size-6 opacity-30" />
            <p>
              {oxCounts.total === 0
                ? "아직 OX SRS 항목이 없습니다. OX 모드에서 선택지/박스를 풀면 자동 큐잉됩니다."
                : `지금 due 인 OX ref 가 없습니다. 7일 내 ${oxCounts.upcoming7d}건 도래.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <p className="text-foreground text-sm font-bold">
              지금 풀어야 할 OX ref {oxItems.length}건
            </p>
            <p className="text-muted-foreground text-xs">
              선택지·박스 항목 단위로 복습. 부모 문제로 진입해 O/X 다시 채점.
            </p>
          </CardHeader>
          <CardContent className="pb-3">
            <OxSrsTable items={oxItems} />
          </CardContent>
        </Card>
      )}

      {/* ── 조문 정독 복습 섹션 ────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        조문 정독 복습
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="due 조문"
          value={articleCounts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 내 도래"
          value={articleCounts.upcoming7d}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="방문한 조문"
          value={articleCounts.totalVisitedArticles}
          tone="sky"
        />
      </div>

      {articleItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground space-y-2 py-8 text-center text-xs">
            <RepeatIcon className="mx-auto size-6 opacity-30" />
            <p>
              {articleCounts.totalVisitedArticles === 0
                ? "아직 방문한 조문이 없습니다. 조문 한 번 열면 자동으로 복습 일정에 들어갑니다."
                : `복습 도래 조문이 없습니다. 7일 내 ${articleCounts.upcoming7d}건 예정.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <p className="text-foreground text-sm font-bold">
              다시 정독할 조문 {articleItems.length}건
            </p>
            <p className="text-muted-foreground text-xs">
              방문 횟수에 따라 7·14·30·60일 간격. 정답/오답 채점이 없어 단순
              방문 알림 모델.
            </p>
          </CardHeader>
          <CardContent className="pb-3">
            <ArticleReviewTable items={articleItems} />
          </CardContent>
        </Card>
      )}

      {/* feat-2-019 합격자 비교 — 게이트 OFF (1년차) 시 카드 자체를 숨김 */}
      {passerBenchmark ? (
        <PasserBenchmarkSection benchmark={passerBenchmark} />
      ) : (
        <Card className="mt-8 border-dashed">
          <CardContent className="text-muted-foreground py-6 text-center text-xs">
            합격자 SRS 비교는 준비 중입니다. 실 합격자 데이터가 누적되면 자동
            활성화됩니다.
          </CardContent>
        </Card>
      )}

      {/* 알고리즘 안내 */}
      <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
        간격 알고리즘: 정답 시 1 → 3 → 7 → 14 → 30 → 60일(최대 90일).
        실패 시 즉시 1일로 리셋 + 어려움 계수(ease) 0.2 감소(최저 1.3).
        객관식·빈칸·OX 동일 알고리즘. 조문 정독은 방문 횟수 기반 7·14·30·60일.
      </p>
    </div>
  );
}

function SrsTrendChart({ trend }: { trend: SrsTrend }) {
  const max = trend.days.reduce(
    (m, d) => Math.max(m, d.added + d.reviewed),
    0,
  );
  if (max === 0) {
    return null;
  }
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold tracking-tight">
            SRS 처리 추이 — 최근 {trend.daysBack}일
          </h2>
          <p className="text-muted-foreground text-xs">
            7일 평균: 신규{" "}
            <span className="text-foreground font-bold">
              {trend.avg7dAdded.toFixed(1)}
            </span>
            /일 · 재처리{" "}
            <span className="text-foreground font-bold">
              {trend.avg7dReviewed.toFixed(1)}
            </span>
            /일
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          매일 SRS 큐에 새로 추가된 항목과 재처리된 항목. 재처리가 신규를 따라잡지
          못하면 큐가 누적됩니다.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-end gap-[2px]">
          {trend.days.map((d) => {
            const total = d.added + d.reviewed;
            const addedPct = total > 0 ? (d.added / max) * 100 : 0;
            const reviewedPct = total > 0 ? (d.reviewed / max) * 100 : 0;
            return (
              <div
                key={d.date}
                className="bg-muted relative h-24 flex-1 rounded-sm"
                title={`${d.date} · 신규 ${d.added} · 재처리 ${d.reviewed}`}
              >
                {reviewedPct > 0 ? (
                  <div
                    className="absolute right-0 bottom-0 left-0 rounded-sm bg-emerald-500"
                    style={{ height: `${Math.max(reviewedPct, 2)}%` }}
                  />
                ) : null}
                {addedPct > 0 ? (
                  <div
                    className="absolute right-0 left-0 rounded-sm bg-rose-400"
                    style={{
                      height: `${Math.max(addedPct, 2)}%`,
                      bottom: `${reviewedPct}%`,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-2 flex items-center justify-between text-[10px] tabular-nums">
          <span>{trend.days[0]?.date}</span>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-rose-400" />
              신규 (큐 추가)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-emerald-500" />
              재처리 (복습)
            </span>
          </div>
          <span>{trend.days[trend.days.length - 1]?.date}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PasserBenchmarkSection({
  benchmark,
}: {
  benchmark: PasserSrsBenchmark;
}) {
  if (!benchmark.hasSample) {
    return (
      <Card className="mt-8 border-dashed">
        <CardContent className="text-muted-foreground py-6 text-center text-xs">
          합격자 표본 부족 — 분석 동의한 합격자 ≥ 3 명이 있을 때 본인 SRS 큐와
          평균 비교가 활성화됩니다 (현재 {benchmark.sampleSize}명).
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mt-8">
      <CardHeader className="pb-3">
        <h2 className="text-base font-bold tracking-tight">
          합격자 평균 vs 본인
        </h2>
        <p className="text-muted-foreground text-xs">
          분석 동의 합격자 {benchmark.sampleSize}명 표본. SRS 큐 보유 평균과 본인
          비교. 작을수록 잘 처리 중.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        <BenchmarkRow label="객관식 due" metric={benchmark.problemDue} />
        <BenchmarkRow label="빈칸 due (세트)" metric={benchmark.blankDueSets} />
        <BenchmarkRow label="OX due" metric={benchmark.oxDue} />
        <BenchmarkRow label="조문 복습 due" metric={benchmark.articleDue} />
        <div className="border-border/40 mt-3 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
          <span className="text-muted-foreground">누적 실패 합산</span>
          <span className="font-mono tabular-nums">
            합격자 평균 {benchmark.totalLapsesAvg.toFixed(1)}회 / 본인{" "}
            {benchmark.userTotalLapses.toLocaleString("ko-KR")}회
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function BenchmarkRow({
  label,
  metric,
}: {
  label: string;
  metric: SrsRowMetric;
}) {
  // delta > 0 = 본인이 더 많이 보유(due 많음) → 부정적, 빨강.
  // delta < 0 = 본인이 더 적게 보유(잘 처리 중) → 긍정, 에메랄드.
  const aheadGood = metric.delta < 0;
  const same = Math.abs(metric.delta) < 0.5;
  const deltaTone = same
    ? "text-muted-foreground"
    : aheadGood
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  const deltaSign = same ? "≈" : metric.delta > 0 ? "+" : "";
  return (
    <div className="grid grid-cols-3 items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">
        평균 {metric.passerAvg.toFixed(1)} · 본인{" "}
        <span className="text-foreground font-bold">
          {metric.userValue}
        </span>
      </span>
      <span className={cn("text-right font-mono font-bold tabular-nums", deltaTone)}>
        {deltaSign}
        {Math.abs(metric.delta).toFixed(1)}
      </span>
    </div>
  );
}

function ArticleReviewTable({ items }: { items: DueArticleReviewItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">조문</TableHead>
            <TableHead className="w-[10%]">과목</TableHead>
            <TableHead className="w-[10%] text-right">방문</TableHead>
            <TableHead className="w-[10%] text-right">간격</TableHead>
            <TableHead className="w-[15%] text-right">last visit</TableHead>
            <TableHead className="w-[15%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.articleId}>
              <TableCell>
                <p className="text-foreground text-sm font-semibold">
                  {it.displayLabel}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                  {it.articleNumber}
                </p>
              </TableCell>
              <TableCell className="font-mono text-[11px]">
                {it.lawCode}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {it.visitCount}회
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {it.intervalDays}d
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                {fmtRelative(it.lastVisitedAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link
                    to={`/subjects/${it.lawCode}/articles/${it.articleNumber}`}
                    viewTransition
                  >
                    정독 <ArrowRightIcon className="size-3.5" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OxSrsTable({ items }: { items: DueOxRefItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[42%]">선택지·박스 항목</TableHead>
            <TableHead className="w-[10%]">유형</TableHead>
            <TableHead className="w-[10%]">과목</TableHead>
            <TableHead className="w-[8%] text-right">실패</TableHead>
            <TableHead className="w-[15%] text-right">due</TableHead>
            <TableHead className="w-[15%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={`${it.refType}-${it.refId}`}>
              <TableCell>
                <p className="text-foreground line-clamp-2 text-xs leading-relaxed">
                  {it.refSnippet || "(본문 없음)"}
                </p>
                {it.year && it.problemNumber ? (
                  <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                    {it.year} · {it.problemNumber}번
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="font-mono text-[11px]">
                {it.refType === "choice" ? "선택지" : "박스"}
              </TableCell>
              <TableCell className="font-mono text-[11px]">
                {it.lawCode ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono text-xs tabular-nums",
                  it.lapses > 2 ? "text-rose-700 dark:text-rose-300" : "",
                )}
              >
                {it.lapses}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                {fmtRelative(it.nextDueAt)}
              </TableCell>
              <TableCell className="text-right">
                {it.lawCode && it.problemId ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      to={`/subjects/${it.lawCode}/problems/${it.problemId}`}
                      viewTransition
                    >
                      풀기 <ArrowRightIcon className="size-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-[10px]">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BlankSrsTable({ items }: { items: DueBlankSetItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">조문</TableHead>
            <TableHead className="w-[10%]">과목</TableHead>
            <TableHead className="w-[10%] text-right">due 빈칸</TableHead>
            <TableHead className="w-[10%] text-right">총 빈칸</TableHead>
            <TableHead className="w-[15%] text-right">due</TableHead>
            <TableHead className="w-[15%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.setId}>
              <TableCell>
                <p className="text-foreground text-sm font-semibold">
                  {it.displayLabel}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                  {it.articleNumber}
                </p>
              </TableCell>
              <TableCell className="font-mono text-[11px]">
                {it.lawCode}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono text-xs tabular-nums",
                  it.dueBlankCount > 3 ? "text-rose-700 dark:text-rose-300" : "",
                )}
              >
                {it.dueBlankCount}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {it.totalBlankSrsCount}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                {fmtRelative(it.earliestDueAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link
                    to={`/subjects/${it.lawCode}/articles/${it.articleNumber}?blank=${it.setId}`}
                    viewTransition
                  >
                    풀기 <ArrowRightIcon className="size-3.5" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "rose" | "amber" | "sky" | "neutral";
}) {
  const cls =
    tone === "rose"
      ? "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "amber"
        ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
        : tone === "sky"
          ? "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300"
          : "border-border bg-card text-muted-foreground";
  return (
    <div className={cn("rounded-xl border p-3.5", cls)}>
      <p className="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {icon} {label}
      </p>
      <p className="text-foreground mt-1.5 text-[22px] leading-none font-extrabold tracking-tight tabular-nums">
        {value.toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

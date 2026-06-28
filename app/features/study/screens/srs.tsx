// feat-2-010 SRS 큐 화면 — /study/srs.
// 본인 객관식 SRS due 항목 list + KPI.
import type { Route } from "./+types/srs";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarClockIcon,
  HistoryIcon,
  RepeatIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { AreaEyebrow, StudentShell } from "~/core/components/student";
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
import { hasMyAnalysisConsent } from "~/features/exam-results/queries.server";
import {
  type DueArticleReviewItem,
  getArticleReviewCounts,
  getDueArticleReviews,
} from "~/features/study/article-review.server";
import { MyAnalysisOffNotice } from "~/features/study/components/my-analysis-off-notice";
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
import { type SrsTrend, getSrsTrend } from "~/features/study/srs-trend.server";
import { getDueProblems, getSrsCounts } from "~/features/study/srs.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [{ title: "오늘의 복습 | 리담" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/study/srs");
  // feat-8-026b A 게이트 — 미동의/철회 시 복습 미표시(데이터는 보존, 재동의 시 복구).
  if (!(await hasMyAnalysisConsent(client, user.id))) {
    return { myAnalysisOff: true as const };
  }
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
      const { hasPoolConsent } = await import(
        "~/features/exam-results/queries.server"
      );
      const gate = await isPasserBenchmarkEnabled();
      // viewer-B 게이트(feat-8-026b) — 전역 게이트 ON + 요청자 풀(B) 동의 동시 충족 시만.
      if (!gate.enabled) return null;
      if (!(await hasPoolConsent(client, user.id))) return null;
      return getPasserSrsBenchmark(user.id, { excludeSynthetic: true });
    })(),
    getSrsTrend(client, user.id, 30),
  ]);
  return {
    myAnalysisOff: false as const,
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
  if (loaderData.myAnalysisOff) return <MyAnalysisOffNotice feature="복습" />;
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
  // feat-2-026 — 과목별 due 묶음 → "복습 시작" 러너 진입(세션=단일 과목 제약).
  const mcqGroups = LAW_SUBJECT_SLUGS.map((slug) => ({
    slug,
    count: items.filter((it) => it.lawCode === slug).length,
  })).filter((g) => g.count > 0);
  return (
    <StudentShell>
      <header className="mb-6">
        <AreaEyebrow area="manage" />
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          복습
        </h1>
        <p className="text-ink-soft mt-2 text-sm leading-relaxed">
          틀리면 1일·맞으면 3·7·14·30·60일 간격으로 자동 일정. 지금 봐야 할
          객관식 문제와 빈칸을 시스템이 끌어옵니다.
        </p>
      </header>

      {/* feat-2-020 SRS 처리 추이 */}
      <SrsTrendChart trend={trend} />

      {/* ── 객관식 SRS 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        객관식 문제
      </p>

      {/* 지표 */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 풀 것"
          value={counts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 안 예정"
          value={counts.upcoming7d}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 복습 항목"
          value={counts.total}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="총 틀린 횟수"
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
                ? "아직 복습 항목이 없습니다."
                : "지금 풀어야 할 항목이 없습니다."}
            </p>
            <p className="text-xs">
              {counts.total === 0
                ? "문제를 한 번 풀면 자동으로 복습 일정에 들어갑니다."
                : `다음 복습까지 7일 안 ${counts.upcoming7d}건.`}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/study/today">오늘의 학습 메뉴</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/study/stats">학습현황</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-bold">
                  지금 풀어야 할 문제 {items.length}건
                </p>
                <p className="text-muted-foreground text-xs">
                  묶음으로 모아 풉니다. 이전/다음으로 넘기며 풀면 다음 복습
                  일정이 자동으로 갱신됩니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-soft self-center text-[11px] font-semibold">
                  묶음 복습
                </span>
                {mcqGroups.map((g) => (
                  <Form
                    key={g.slug}
                    method="post"
                    action="/api/study/session-from-srs"
                  >
                    <input type="hidden" name="subject" value={g.slug} />
                    <Button size="sm" type="submit" className="rounded-full">
                      {LAW_SUBJECTS[g.slug].name} {g.count}문항
                      <ArrowRightIcon className="size-3.5" />
                    </Button>
                  </Form>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">문제</TableHead>
                    <TableHead className="hidden w-[10%] sm:table-cell">
                      과목
                    </TableHead>
                    <TableHead className="hidden w-[10%] text-right sm:table-cell">
                      간격
                    </TableHead>
                    <TableHead className="hidden w-[10%] text-right sm:table-cell">
                      틀림
                    </TableHead>
                    <TableHead className="w-[15%] text-right">예정일</TableHead>
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
                          <p className="text-muted-foreground mt-1 font-mono text-[11px] sm:text-[10px]">
                            {it.primaryArticleLabel}
                            {it.year ? ` · ${it.year}` : ""}
                            {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                          </p>
                        ) : null}
                        {/* 모바일 전용 — 숨긴 컬럼(과목·간격·틀림) 보조 표기 */}
                        <p className="text-muted-foreground mt-1 font-mono text-[11px] sm:hidden">
                          {it.lawCode} · {it.intervalDays}d · 틀림 {it.lapses}
                        </p>
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] sm:table-cell">
                        {it.lawCode}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs tabular-nums sm:table-cell">
                        {it.intervalDays}d
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden text-right font-mono text-xs tabular-nums sm:table-cell",
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
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-9 sm:h-8"
                        >
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

      {/* ── 빈칸 학습 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        빈칸 학습
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 풀 세트"
          value={blankCounts.dueSets}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 풀 빈칸"
          value={blankCounts.dueBlanks}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 빈칸"
          value={blankCounts.totalBlanks}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="총 틀린 횟수"
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
                ? "아직 복습 일정에 들어간 빈칸이 없습니다. 빈칸 세트를 한 번 풀면 자동으로 일정이 잡힙니다."
                : `지금 풀 빈칸이 없습니다. 7일 안 ${blankCounts.upcoming7dSets}세트 예정.`}
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

      {/* ── 정오문제 채점 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mt-8 mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        정오문제 채점
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="오늘 풀 항목"
          value={oxCounts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 안 예정"
          value={oxCounts.upcoming7d}
          tone="amber"
        />
        <KpiTile
          icon={<RepeatIcon className="size-3" />}
          label="총 정오문제 항목"
          value={oxCounts.total}
          tone="sky"
        />
        <KpiTile
          icon={<HistoryIcon className="size-3" />}
          label="총 틀린 횟수"
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
                ? "아직 복습 일정에 들어간 정오문제 항목이 없습니다. 정오문제 모드에서 선택지/박스를 풀면 자동으로 일정이 잡힙니다."
                : `지금 풀 정오문제 항목이 없습니다. 7일 안 ${oxCounts.upcoming7d}건 예정.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-foreground text-sm font-bold">
                  지금 풀어야 할 정오문제 항목 {oxItems.length}건
                </p>
                <p className="text-muted-foreground text-xs">
                  선택지·박스 항목 단위로 O/X 를 다시 채점하면 복습 일정이
                  갱신됩니다.
                </p>
              </div>
              <Button size="sm" asChild className="rounded-full">
                <Link to="/study/srs/ox" viewTransition>
                  정오문제 복습 시작 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
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
          label="오늘 다시 볼 조문"
          value={articleCounts.due}
          tone="rose"
        />
        <KpiTile
          icon={<CalendarClockIcon className="size-3" />}
          label="7일 안 예정"
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
                : `다시 볼 조문이 없습니다. 7일 안 ${articleCounts.upcoming7d}건 예정.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-foreground text-sm font-bold">
                다시 정독할 조문 {articleItems.length}건
              </p>
              <span className="bg-muted text-ink-soft rounded-full px-2 py-0.5 text-[10px] font-semibold">
                읽기 목록 · 채점 없음
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              조문을 클릭하면 본래 위치(조문 뷰어)에서 정독합니다. 채점은 없고,
              한 번 열어 읽으면 방문 횟수에 따라 7·14·30·60일 간격으로 다음
              알림이 잡힙니다.
            </p>
          </CardHeader>
          <CardContent className="pb-3">
            <ArticleReviewList items={articleItems} />
          </CardContent>
        </Card>
      )}

      {/* feat-2-019 합격자 비교 — 게이트 OFF (1년차) 시 카드 자체를 숨김 */}
      {passerBenchmark ? (
        <PasserBenchmarkSection benchmark={passerBenchmark} />
      ) : (
        <Card className="mt-8 border-dashed">
          <CardContent className="text-muted-foreground py-6 text-center text-xs">
            합격자 비교는 준비 중입니다. 합격자 데이터가 쌓이면 자동으로
            열립니다.
          </CardContent>
        </Card>
      )}

      {/* 일정 안내 */}
      <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
        복습 일정: 맞히면 1 → 3 → 7 → 14 → 30 → 60일(최대 90일) 간격으로
        벌어집니다. 틀리면 다음 날 다시 풀게 잡힙니다. 객관식·빈칸·정오문제 모두
        같은 방식이고, 조문 정독은 방문 횟수에 따라 7·14·30·60일.
      </p>
    </StudentShell>
  );
}

function SrsTrendChart({ trend }: { trend: SrsTrend }) {
  const max = trend.days.reduce((m, d) => Math.max(m, d.added + d.reviewed), 0);
  if (max === 0) {
    return null;
  }
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold tracking-tight">
            복습 추이 — 최근 {trend.daysBack}일
          </h2>
          <p className="text-muted-foreground text-xs">
            7일 평균: 신규{" "}
            <span className="text-foreground font-bold">
              {trend.avg7dAdded.toFixed(1)}
            </span>
            /일 · 다시 푼 항목{" "}
            <span className="text-foreground font-bold">
              {trend.avg7dReviewed.toFixed(1)}
            </span>
            /일
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          매일 복습 일정에 새로 들어온 항목과 다시 푼 항목입니다. 다시 푸는
          속도가 새로 들어오는 속도를 못 따라가면 밀린 항목이 쌓입니다.
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
              새로 들어옴
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-emerald-500" />
              다시 푼 것
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
          합격자 표본이 부족합니다. 분석에 동의한 합격자가 3명 이상 모이면 본인
          복습 현황과 평균을 비교해 드립니다 (현재 {benchmark.sampleSize}명).
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
          분석에 동의한 합격자 {benchmark.sampleSize}명 표본. 복습 항목 평균과
          본인 비교. 숫자가 작을수록 잘 따라가고 있다는 뜻.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        <BenchmarkRow label="객관식 풀 것" metric={benchmark.problemDue} />
        <BenchmarkRow label="빈칸 풀 세트" metric={benchmark.blankDueSets} />
        <BenchmarkRow label="정오문제 풀 항목" metric={benchmark.oxDue} />
        <BenchmarkRow label="조문 다시 볼 것" metric={benchmark.articleDue} />
        <div className="border-border/40 mt-3 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
          <span className="text-muted-foreground">총 틀린 횟수</span>
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
        <span className="text-foreground font-bold">{metric.userValue}</span>
      </span>
      <span
        className={cn("text-right font-mono font-bold tabular-nums", deltaTone)}
      >
        {deltaSign}
        {Math.abs(metric.delta).toFixed(1)}
      </span>
    </div>
  );
}

// 조문 정독은 "풀기"가 아니라 "읽기"라 표(풀기 섹션 형식) 대신 읽기 전용 클릭 리스트로.
// 행 전체가 조문 뷰어(정독의 자연스러운 위치)로 가는 링크 — 클릭하면 방문 기록이 남아
// 일정이 자동으로 다음 간격으로 밀린다(채점 없음).
function ArticleReviewList({ items }: { items: DueArticleReviewItem[] }) {
  return (
    <ul className="divide-border divide-y">
      {items.map((it) => (
        <li key={it.articleId}>
          <Link
            to={`/subjects/${it.lawCode}/articles/${it.articleNumber}`}
            viewTransition
            className="group hover:bg-surface-3 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
          >
            <span className="bg-muted text-ink-soft group-hover:text-link inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
              <BookOpenIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-semibold">
                {it.displayLabel}
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                {LAW_SUBJECTS[it.lawCode].name} · {it.articleNumber} · 방문{" "}
                {it.visitCount}회 · {fmtRelative(it.lastVisitedAt)}
              </p>
            </div>
            <span className="text-ink-faint group-hover:text-link inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold whitespace-nowrap">
              읽기 <ArrowRightIcon className="size-3.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OxSrsTable({ items }: { items: DueOxRefItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[42%]">선택지·박스 항목</TableHead>
            <TableHead className="hidden w-[10%] sm:table-cell">유형</TableHead>
            <TableHead className="hidden w-[10%] sm:table-cell">과목</TableHead>
            <TableHead className="hidden w-[8%] text-right sm:table-cell">
              틀림
            </TableHead>
            <TableHead className="w-[15%] text-right">예정일</TableHead>
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
                  <p className="text-muted-foreground mt-1 font-mono text-[11px] sm:text-[10px]">
                    {it.year} · {it.problemNumber}번
                  </p>
                ) : null}
                {/* 모바일 전용 — 숨긴 컬럼(유형·과목·틀림) 보조 표기 */}
                <p className="text-muted-foreground mt-1 font-mono text-[11px] sm:hidden">
                  {it.refType === "choice" ? "선택지" : "박스"}
                  {it.lawCode ? ` · ${it.lawCode}` : ""} · 틀림 {it.lapses}
                </p>
              </TableCell>
              <TableCell className="hidden font-mono text-[11px] sm:table-cell">
                {it.refType === "choice" ? "선택지" : "박스"}
              </TableCell>
              <TableCell className="hidden font-mono text-[11px] sm:table-cell">
                {it.lawCode ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "hidden text-right font-mono text-xs tabular-nums sm:table-cell",
                  it.lapses > 2 ? "text-rose-700 dark:text-rose-300" : "",
                )}
              >
                {it.lapses}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                {fmtRelative(it.nextDueAt)}
              </TableCell>
              <TableCell className="text-right">
                {/* feat-2-022 ⑨ — OX SRS 복습 러너로(이전: OX UI 없는 MCQ 뷰어 단절). */}
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-9 sm:h-8"
                >
                  <Link to="/study/srs/ox" viewTransition>
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

function BlankSrsTable({ items }: { items: DueBlankSetItem[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">조문</TableHead>
            <TableHead className="hidden w-[10%] sm:table-cell">과목</TableHead>
            <TableHead className="hidden w-[10%] text-right sm:table-cell">
              오늘 풀 빈칸
            </TableHead>
            <TableHead className="hidden w-[10%] text-right sm:table-cell">
              총 빈칸
            </TableHead>
            <TableHead className="w-[15%] text-right">예정일</TableHead>
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
                <p className="text-muted-foreground mt-0.5 font-mono text-[11px] sm:text-[10px]">
                  {it.articleNumber}
                </p>
                {/* 모바일 전용 — 숨긴 컬럼(과목·오늘 풀 빈칸·총 빈칸) 보조 표기 */}
                <p className="text-muted-foreground mt-1 font-mono text-[11px] sm:hidden">
                  {it.lawCode} · 오늘 {it.dueBlankCount} / 총{" "}
                  {it.totalBlankSrsCount}
                </p>
              </TableCell>
              <TableCell className="hidden font-mono text-[11px] sm:table-cell">
                {it.lawCode}
              </TableCell>
              <TableCell
                className={cn(
                  "hidden text-right font-mono text-xs tabular-nums sm:table-cell",
                  it.dueBlankCount > 3
                    ? "text-rose-700 dark:text-rose-300"
                    : "",
                )}
              >
                {it.dueBlankCount}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-xs tabular-nums sm:table-cell">
                {it.totalBlankSrsCount}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-[11px]">
                {fmtRelative(it.earliestDueAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-9 sm:h-8"
                >
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

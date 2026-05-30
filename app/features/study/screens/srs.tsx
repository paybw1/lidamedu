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
  type DueOxRefItem,
  getDueOxRefs,
  getOxSrsCounts,
} from "~/features/study/ox-srs.server";
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
  const [items, counts, blankItems, blankCounts, oxItems, oxCounts] =
    await Promise.all([
      getDueProblems(client, user.id, 100),
      getSrsCounts(client, user.id),
      getDueBlankSets(client, user.id, 50),
      getBlankSrsCounts(client, user.id),
      getDueOxRefs(client, user.id, 100),
      getOxSrsCounts(client, user.id),
    ]);
  return { items, counts, blankItems, blankCounts, oxItems, oxCounts };
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
  const { items, counts, blankItems, blankCounts, oxItems, oxCounts } =
    loaderData;
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

      {/* ── 객관식 SRS 섹션 ─────────────────────────────────────────── */}
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
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

      {/* 알고리즘 안내 */}
      <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
        간격 알고리즘: 정답 시 1 → 3 → 7 → 14 → 30 → 60일(최대 90일).
        실패 시 즉시 1일로 리셋 + 어려움 계수(ease) 0.2 감소(최저 1.3).
        객관식·빈칸·OX 동일 알고리즘. 빈칸은 칸 단위로 추적하고 세트 단위로,
        OX 는 ref(선택지/박스 항목) 단위로 추적·표시.
      </p>
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

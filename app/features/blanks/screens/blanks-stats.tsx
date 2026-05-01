import {
  ArrowRightIcon,
  BrainIcon,
  PencilLineIcon,
  TargetIcon,
  TrendingDownIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
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
import {
  getUserAutoBlankStats,
  getUserBlankStats,
  type UserAutoBlankStats,
  type UserBlankStats,
} from "~/features/blanks/queries.server";
import {
  getUserRecitationStats,
  type UserRecitationStats,
} from "~/features/recitation/queries.server";

import type { Route } from "./+types/blanks-stats";

export const meta: Route.MetaFunction = () => [
  { title: "빈칸 학습 통계 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const [content, subject, period, recitation] = await Promise.all([
    getUserBlankStats(client, user.id),
    getUserAutoBlankStats(client, user.id, "subject"),
    getUserAutoBlankStats(client, user.id, "period"),
    getUserRecitationStats(client, user.id),
  ]);
  return { content, subject, period, recitation };
}

export default function BlanksStats({ loaderData }: Route.ComponentProps) {
  const { content, subject, period, recitation } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          학습
        </p>
        <h1 className="text-2xl font-bold tracking-tight">빈칸 채우기 통계</h1>
        <p className="text-muted-foreground text-sm">
          내용 / 주체 / 시기 빈칸 모드별 학습 진행 현황을 확인하세요.
        </p>
      </header>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">
            내용 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {content.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="subject">
            주체 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {subject.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="period">
            시기 빈칸{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {period.totalAttempts}
            </span>
          </TabsTrigger>
          <TabsTrigger value="recitation">
            <BrainIcon className="mr-1 size-3.5" />
            암기{" "}
            <span className="text-muted-foreground ml-1 tabular-nums">
              {recitation.totalAttempts}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <ContentStatsView stats={content} />
        </TabsContent>
        <TabsContent value="subject">
          <AutoStatsView stats={subject} blankType="subject" />
        </TabsContent>
        <TabsContent value="period">
          <AutoStatsView stats={period} blankType="period" />
        </TabsContent>
        <TabsContent value="recitation">
          <RecitationStatsView stats={recitation} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatsKpiRow({
  totalAttempts,
  correctAttempts,
  uniqueBlanksAttempted,
  uniqueBlanksCorrect,
  weakCount,
}: {
  totalAttempts: number;
  correctAttempts: number;
  uniqueBlanksAttempted: number;
  uniqueBlanksCorrect: number;
  weakCount: number;
}) {
  const correctRate =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  const blankProgress =
    uniqueBlanksAttempted > 0
      ? Math.round((uniqueBlanksCorrect / uniqueBlanksAttempted) * 100)
      : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <KpiCard
        icon={PencilLineIcon}
        label="총 시도"
        value={String(totalAttempts)}
      />
      <KpiCard
        icon={TargetIcon}
        label="정답률"
        value={`${correctRate}%`}
        subtle={`정답 ${correctAttempts} / ${totalAttempts}`}
      />
      <KpiCard
        label="시도한 빈칸"
        value={String(uniqueBlanksAttempted)}
        subtle={`해결 ${uniqueBlanksCorrect} (${blankProgress}%)`}
      />
      <KpiCard
        icon={TrendingDownIcon}
        label="약점 빈칸"
        value={String(weakCount)}
        subtle="해결 못한 빈칸"
        warn={weakCount > 0}
      />
    </div>
  );
}

function ContentStatsView({ stats }: { stats: UserBlankStats }) {
  return (
    <div className="space-y-4">
      <StatsKpiRow
        totalAttempts={stats.totalAttempts}
        correctAttempts={stats.correctAttempts}
        uniqueBlanksAttempted={stats.uniqueBlanksAttempted}
        uniqueBlanksCorrect={stats.uniqueBlanksCorrect}
        weakCount={stats.weakBlanks.length}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              최근 학습
            </p>
          </CardHeader>
          <CardContent className="px-0">
            {stats.recentArticles.length === 0 ? (
              <EmptyMsg text="아직 빈칸을 시도한 기록이 없습니다." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead className="w-24 text-xs">강사</TableHead>
                    <TableHead className="w-24 text-right">진행</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentArticles.map((r) => (
                    <TableRow key={r.setId}>
                      <TableCell>
                        <p className="text-sm font-medium">{r.articleLabel}</p>
                        <p className="text-muted-foreground text-xs">
                          {r.lawCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.ownerName ?? "(이름없음)"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.correctBlanks} / {r.totalBlanks}
                      </TableCell>
                      <TableCell>
                        {r.articleNumber ? (
                          <Link
                            to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?blank=${r.setId}`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            계속 <ArrowRightIcon className="size-3" />
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                약점 빈칸
              </p>
              <Badge variant="outline" className="text-[10px]">
                해결 못한 빈칸 우선
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {stats.weakBlanks.length === 0 ? (
              <EmptyMsg text="약점 빈칸이 없습니다 — 시도한 빈칸을 모두 풀었습니다!" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead className="w-20 text-xs">강사</TableHead>
                    <TableHead className="w-14 text-right">시도</TableHead>
                    <TableHead className="w-14 text-right">오답</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.weakBlanks.map((w) => (
                    <TableRow key={`${w.setId}:${w.blankIdx}`}>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {w.articleLabel}
                          <span className="text-muted-foreground ml-1 text-xs">
                            #{w.blankIdx}
                          </span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {w.lawCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {w.ownerName ?? "(이름없음)"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {w.attempts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-rose-600 dark:text-rose-400">
                        {w.wrongCount}
                      </TableCell>
                      <TableCell>
                        {w.articleNumber ? (
                          <Link
                            to={`/subjects/${w.lawCode}/articles/${w.articleNumber}?blank=${w.setId}`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            도전 <ArrowRightIcon className="size-3" />
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AutoStatsView({
  stats,
  blankType,
}: {
  stats: UserAutoBlankStats;
  blankType: "subject" | "period";
}) {
  const modeQuery = blankType === "subject" ? "subjectBlank=1" : "periodBlank=1";
  return (
    <div className="space-y-4">
      <StatsKpiRow
        totalAttempts={stats.totalAttempts}
        correctAttempts={stats.correctAttempts}
        uniqueBlanksAttempted={stats.uniqueBlanksAttempted}
        uniqueBlanksCorrect={stats.uniqueBlanksCorrect}
        weakCount={stats.weakBlanks.length}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              최근 학습
            </p>
          </CardHeader>
          <CardContent className="px-0">
            {stats.recentArticles.length === 0 ? (
              <EmptyMsg text="아직 시도한 기록이 없습니다." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead className="w-24 text-right">정답률</TableHead>
                    <TableHead className="w-24 text-right">진행</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentArticles.map((r) => {
                    const rate =
                      r.totalAttempts > 0
                        ? Math.round(
                            (r.correctAttempts / r.totalAttempts) * 100,
                          )
                        : 0;
                    return (
                      <TableRow key={r.articleId}>
                        <TableCell>
                          <p className="text-sm font-medium">
                            {r.articleLabel}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {r.lawCode}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {rate}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {r.uniqueBlanksCorrect} / {r.uniqueBlanksAttempted}
                        </TableCell>
                        <TableCell>
                          {r.articleNumber ? (
                            <Link
                              to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?${modeQuery}`}
                              viewTransition
                              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                            >
                              계속 <ArrowRightIcon className="size-3" />
                            </Link>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                약점 빈칸
              </p>
              <Badge variant="outline" className="text-[10px]">
                해결 못한 빈칸 우선
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {stats.weakBlanks.length === 0 ? (
              <EmptyMsg text="약점 빈칸이 없습니다." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead>정답</TableHead>
                    <TableHead className="w-14 text-right">시도</TableHead>
                    <TableHead className="w-14 text-right">오답</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.weakBlanks.map((w) => (
                    <TableRow
                      key={`${w.articleId}:${w.blockIndex}:${w.cumOffset}`}
                    >
                      <TableCell>
                        <p className="text-sm font-medium">{w.articleLabel}</p>
                        <p className="text-muted-foreground text-xs">
                          {w.lawCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{w.answer}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {w.attempts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-rose-600 dark:text-rose-400">
                        {w.wrongCount}
                      </TableCell>
                      <TableCell>
                        {w.articleNumber ? (
                          <Link
                            to={`/subjects/${w.lawCode}/articles/${w.articleNumber}?${modeQuery}`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            도전 <ArrowRightIcon className="size-3" />
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecitationStatsView({ stats }: { stats: UserRecitationStats }) {
  const completionRate =
    stats.totalAttempts > 0
      ? Math.round((stats.completedAttempts / stats.totalAttempts) * 100)
      : 0;
  const articleProgress =
    stats.uniqueArticlesAttempted > 0
      ? Math.round(
          (stats.uniqueArticlesCompleted / stats.uniqueArticlesAttempted) * 100,
        )
      : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={BrainIcon}
          label="총 시도"
          value={String(stats.totalAttempts)}
          subtle={`완료 ${stats.completedAttempts}`}
        />
        <KpiCard
          icon={TargetIcon}
          label="평균 유사도"
          value={`${Math.round(stats.averageSimilarity * 100)}%`}
          subtle={`완료율 ${completionRate}%`}
        />
        <KpiCard
          label="시도한 조문"
          value={String(stats.uniqueArticlesAttempted)}
          subtle={`완료 ${stats.uniqueArticlesCompleted} (${articleProgress}%)`}
        />
        <KpiCard
          icon={TrendingDownIcon}
          label="약점 조문"
          value={String(stats.weakArticles.length)}
          subtle="유사도 < 90%"
          warn={stats.weakArticles.length > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              최근 학습
            </p>
          </CardHeader>
          <CardContent className="px-0">
            {stats.recentArticles.length === 0 ? (
              <EmptyMsg text="아직 암기를 시도한 기록이 없습니다." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead className="w-20 text-right">최고</TableHead>
                    <TableHead className="w-20 text-right">시도</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentArticles.map((r) => (
                    <TableRow key={r.articleId}>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {r.articleLabel}
                          {r.importance >= 2 ? (
                            <BrainIcon className="ml-1 inline size-3 text-violet-600 dark:text-violet-400" />
                          ) : null}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {r.lawCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {Math.round(r.bestSimilarity * 100)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.totalAttempts}
                      </TableCell>
                      <TableCell>
                        {r.articleNumber ? (
                          <Link
                            to={`/subjects/${r.lawCode}/articles/${r.articleNumber}?recitation=1`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            계속 <ArrowRightIcon className="size-3" />
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                약점 조문
              </p>
              <Badge variant="outline" className="text-[10px]">
                별 2+ 우선
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {stats.weakArticles.length === 0 ? (
              <EmptyMsg text="약점이 없습니다 — 시도한 조문을 모두 완성했습니다!" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>조문</TableHead>
                    <TableHead className="w-20 text-right">최고</TableHead>
                    <TableHead className="w-14 text-right">시도</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.weakArticles.map((w) => (
                    <TableRow key={w.articleId}>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {w.articleLabel}
                          {w.importance >= 2 ? (
                            <BrainIcon className="ml-1 inline size-3 text-violet-600 dark:text-violet-400" />
                          ) : null}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {w.lawCode}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-rose-600 dark:text-rose-400">
                        {Math.round(w.bestSimilarity * 100)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {w.attempts}
                      </TableCell>
                      <TableCell>
                        {w.articleNumber ? (
                          <Link
                            to={`/subjects/${w.lawCode}/articles/${w.articleNumber}?recitation=1`}
                            viewTransition
                            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            도전 <ArrowRightIcon className="size-3" />
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground px-6 py-6 text-center text-sm">
      {text}
    </p>
  );
}

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

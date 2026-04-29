import {
  ArrowRightIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { getUserBlankStats } from "~/features/blanks/queries.server";

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
  const stats = await getUserBlankStats(client, user.id);
  return { stats };
}

export default function BlanksStats({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;
  const correctRate =
    stats.totalAttempts > 0
      ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100)
      : 0;
  const blankProgress =
    stats.uniqueBlanksAttempted > 0
      ? Math.round(
          (stats.uniqueBlanksCorrect / stats.uniqueBlanksAttempted) * 100,
        )
      : 0;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          학습
        </p>
        <h1 className="text-2xl font-bold tracking-tight">빈칸 채우기 통계</h1>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={PencilLineIcon}
          label="총 시도"
          value={String(stats.totalAttempts)}
        />
        <KpiCard
          icon={TargetIcon}
          label="정답률"
          value={`${correctRate}%`}
          subtle={`정답 ${stats.correctAttempts} / ${stats.totalAttempts}`}
        />
        <KpiCard
          label="시도한 빈칸"
          value={String(stats.uniqueBlanksAttempted)}
          subtle={`해결 ${stats.uniqueBlanksCorrect} (${blankProgress}%)`}
        />
        <KpiCard
          icon={TrendingDownIcon}
          label="약점 빈칸"
          value={String(stats.weakBlanks.length)}
          subtle="해결 못한 빈칸"
          warn={stats.weakBlanks.length > 0}
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
              <p className="text-muted-foreground px-6 py-6 text-center text-sm">
                아직 빈칸을 시도한 기록이 없습니다.
              </p>
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
              <p className="text-muted-foreground px-6 py-6 text-center text-sm">
                약점 빈칸이 없습니다 — 시도한 빈칸을 모두 풀었습니다!
              </p>
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

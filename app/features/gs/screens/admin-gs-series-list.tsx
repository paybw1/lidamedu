// 시리즈 목록 — 운영자.

import { ArrowRightIcon, ChartLineIcon, PlusIcon } from "lucide-react";
import { Link, data } from "react-router";

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
import makeServerClient from "~/core/lib/supa-client.server";
import { listAllGsSeries } from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-list";

export const meta: Route.MetaFunction = () => [
  { title: "GS 시리즈 관리 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const series = await listAllGsSeries(client);

  // 시리즈별 회차 수 집계.
  const seriesIds = series.map((s) => s.seriesId);
  const counts: Record<string, number> = {};
  if (seriesIds.length > 0) {
    const { data: rows } = await client
      .from("gs_rounds")
      .select("series_id")
      .in("series_id", seriesIds);
    for (const r of rows ?? []) {
      if (r.series_id)
        counts[r.series_id] = (counts[r.series_id] ?? 0) + 1;
    }
  }

  return { series, counts };
}

export default function AdminGsSeriesList({
  loaderData,
}: Route.ComponentProps) {
  const { series, counts } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <ChartLineIcon className="size-3.5" /> 운영자 · GS 시리즈
          </p>
          <h1 className="text-2xl font-bold tracking-tight">시리즈 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            여러 회차(보통 8회)를 묶어 학생별 추이와 누적 z-score 를 분석합니다.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/gs/series/new" viewTransition>
            <PlusIcon className="size-4" /> 새 시리즈
          </Link>
        </Button>
      </header>

      {series.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">등록된 시리즈가 없습니다.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">제목</TableHead>
                  <TableHead className="w-[100px]">과목</TableHead>
                  <TableHead className="w-[110px]">예정 회차</TableHead>
                  <TableHead className="w-[110px]">등록 회차</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => (
                  <TableRow key={s.seriesId}>
                    <TableCell>
                      <Link
                        to={`/admin/gs/series/${s.seriesId}`}
                        className="hover:text-primary font-medium"
                      >
                        {s.title}
                      </Link>
                      {s.descriptionMd ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                          {s.descriptionMd}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary" className="text-[10px]">
                        {LAW_SUBJECTS[s.subject]?.name ?? s.subject}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {s.expectedRounds}회
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {counts[s.seriesId] ?? 0}회
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/gs/series/${s.seriesId}/stats`}
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        통계 <ArrowRightIcon className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

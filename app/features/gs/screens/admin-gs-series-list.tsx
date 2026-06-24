// 시리즈 목록 — 운영자.
// 패턴 P2 LIST/TABLE. AdminShell cluster="gs".

import { PlusIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  TD,
  TR,
  type TableHeaderDef,
} from "~/features/admin/components/admin-ui";
import { listAllGsSeries } from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-list";

export const meta: Route.MetaFunction = () => [
  { title: "GS 시리즈 관리 | 리담변리사학원" },
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

  return { series, counts, role };
}

const TABLE_HEADERS: TableHeaderDef[] = [
  { label: "제목" },
  { label: "과목", width: "8rem" },
  { label: "예정 회차", width: "7rem", align: "right" },
  { label: "등록 회차", width: "7rem", align: "right" },
  { label: "", width: "4rem", align: "right" },
];

export default function AdminGsSeriesList({
  loaderData,
}: Route.ComponentProps) {
  const { series, counts, role } = loaderData;

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title="시리즈 관리"
      desc="여러 회차(보통 8회)를 묶어 학생별 추이와 누적 z-score 를 분석합니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/gs/series/new" viewTransition>
            <PlusIcon className="size-3.5" /> 새 시리즈
          </Link>
        </Button>
      }
    >
      {series.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          등록된 시리즈가 없습니다. 새 시리즈를 만들어 보세요.
        </div>
      ) : (
        <IndexTable
          minWidth={640}
          headers={TABLE_HEADERS}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {series.length}개
            </div>
          }
        >
          {series.map((s) => {
            const registered = counts[s.seriesId] ?? 0;
            const complete = registered >= s.expectedRounds;
            return (
              <TR key={s.seriesId}>
                <TD>
                  <Link
                    to={`/admin/gs/series/${s.seriesId}`}
                    className="text-link hover:underline font-medium"
                  >
                    {s.title}
                  </Link>
                  {s.descriptionMd ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                      {s.descriptionMd}
                    </p>
                  ) : null}
                </TD>
                <TD>
                  <Chip tone="blue">
                    {LAW_SUBJECTS[s.subject]?.name ?? s.subject}
                  </Chip>
                </TD>
                <TD align="right" mono soft>
                  {s.expectedRounds}회
                </TD>
                <TD align="right" mono>
                  <span
                    className={
                      complete
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : undefined
                    }
                  >
                    {registered}회
                  </span>
                </TD>
                <TD align="right">
                  <Link
                    to={`/admin/gs/series/${s.seriesId}/stats`}
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    통계
                  </Link>
                </TD>
              </TR>
            );
          })}
        </IndexTable>
      )}
    </AdminShell>
  );
}

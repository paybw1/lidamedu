// feat-7-044 — 반 테스트 시리즈 성적 추이 (운영자).
// 행=학생, 열=회차. 셀=점수%(석차·백분위 툴팁). "누가 오르고 누가 처지는가" 한눈.

import { LineChartIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getCohortById, listCohortMembers } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getSeriesTrend,
  listSeries,
} from "~/features/offline-tests/series.server";

import type { Route } from "./+types/admin-cohort-test-series";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "시험 추이 | 리담변리사학원" }];
  return [{ title: `${d.cohort.name} 시험 추이 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId) throw data("Missing cohortId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const series = await listSeries(client, params.cohortId);
  const url = new URL(request.url);
  const selectedId =
    url.searchParams.get("series") ??
    series[series.length - 1]?.seriesId ??
    null;

  const [trend, members] = await Promise.all([
    selectedId ? getSeriesTrend(client, selectedId) : Promise.resolve(null),
    listCohortMembers(client, params.cohortId),
  ]);
  // 시리즈-반 교차 접근 차단.
  const safeTrend = trend && trend.cohortId === params.cohortId ? trend : null;

  return {
    cohort,
    role,
    series,
    selectedId,
    trend: safeTrend,
    nameById: Object.fromEntries(members.map((m) => [m.profileId, m.name])),
  };
}

function pctTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export default function AdminCohortTestSeries({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, role, series, selectedId, trend, nameById } = loaderData;
  const base = `/admin/cohorts/${cohort.cohortId}/test-series`;

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={1100}
      title={`${cohort.name} — 시험 추이`}
      desc="시리즈(주간 테스트 묶음)별 학생 성적 추이. 점수는 % 환산."
    >
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 반 상세
      </Link>

      {/* 시리즈 선택 + 생성 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {series.map((s) => (
          <Link
            key={s.seriesId}
            to={`${base}?series=${s.seriesId}`}
            preventScrollReset
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              s.seriesId === selectedId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary",
            )}
          >
            {s.title}
            <span
              className={cn(
                "text-[10px] tabular-nums",
                s.seriesId === selectedId
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground",
              )}
            >
              {s.testCount}회
            </span>
          </Link>
        ))}
        <NewSeriesForm cohortId={cohort.cohortId} />
      </div>

      {series.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          <LineChartIcon className="mx-auto mb-2 size-6 opacity-40" />
          시리즈가 없습니다. 위에서 시리즈를 만들고, 시험지 빌더에서 테스트를
          시리즈에 지정하세요.
        </div>
      ) : !trend || trend.rounds.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          이 시리즈에 지정된 테스트(회차)가 없습니다. 시험지 빌더의 "시리즈"
          영역에서 지정하세요.
        </div>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="bg-card sticky left-0 z-10 px-3 py-2 font-semibold">
                  학생
                </th>
                {trend.rounds.map((r) => (
                  <th
                    key={r.roundNo}
                    className="px-2 py-2 text-right font-semibold"
                    title={`${r.title} · 응시 ${r.takenCount}명${r.maxScore ? ` · ${r.maxScore}점 만점` : ""}`}
                  >
                    {r.roundNo}회
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">평균</th>
                <th className="px-3 py-2 text-right font-semibold">추세</th>
              </tr>
              {/* 회차 평균 행 */}
              <tr className="bg-muted/40 border-b">
                <td className="bg-muted/40 sticky left-0 z-10 px-3 py-1.5 font-semibold">
                  반 평균
                </td>
                {trend.rounds.map((r) => (
                  <td
                    key={r.roundNo}
                    className={cn(
                      "px-2 py-1.5 text-right font-bold tabular-nums",
                      pctTone(r.avgPct),
                    )}
                  >
                    {r.avgPct === null ? "—" : `${r.avgPct}%`}
                  </td>
                ))}
                <td className="px-2 py-1.5" />
                <td className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {trend.students.map((st) => {
                const cellByRound = new Map(st.cells.map((c) => [c.roundNo, c]));
                return (
                  <tr key={st.profileId}>
                    <td className="bg-card sticky left-0 z-10 px-3 py-2 font-medium whitespace-nowrap">
                      <Link
                        to={`/admin/students/${st.profileId}`}
                        viewTransition
                        className="hover:text-link"
                      >
                        {nameById[st.profileId] ?? "—"}
                      </Link>
                    </td>
                    {trend.rounds.map((r) => {
                      const c = cellByRound.get(r.roundNo);
                      if (!c) {
                        return (
                          <td
                            key={r.roundNo}
                            className="text-muted-foreground/50 px-2 py-2 text-right"
                          >
                            —
                          </td>
                        );
                      }
                      const percentile = Math.round((c.rank / c.taken) * 100);
                      return (
                        <td
                          key={r.roundNo}
                          className={cn(
                            "px-2 py-2 text-right font-bold tabular-nums",
                            pctTone(c.pct),
                          )}
                          title={`${c.score}점 · ${c.rank}/${c.taken}위 · 상위 ${percentile}%`}
                        >
                          {c.pct}%
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-bold tabular-nums",
                        pctTone(st.avgPct),
                      )}
                    >
                      {st.avgPct === null ? "—" : `${st.avgPct}%`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {st.deltaPct === null ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : st.deltaPct > 0 ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          ▲{st.deltaPct}
                        </span>
                      ) : st.deltaPct < 0 ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          ▼{Math.abs(st.deltaPct)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted-foreground mt-3 text-[11px]">
        셀에 마우스를 올리면 점수·석차·백분위가 보입니다. 추세 = 최근 회차 −
        직전 회차 (%p).
      </p>
    </AdminShell>
  );
}

function NewSeriesForm({ cohortId }: { cohortId: string }) {
  const fetcher = useFetcher<{ ok?: true; seriesId?: string; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.seriesId
    ) {
      navigate(`${location.pathname}?series=${fetcher.data.seriesId}`, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/offline-test"
      className="ml-auto flex items-center gap-1.5"
    >
      <input type="hidden" name="intent" value="create_series" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <Input
        name="title"
        required
        maxLength={200}
        placeholder="새 시리즈 (예: 주간 테스트)"
        className="h-8 w-44 text-xs"
      />
      <Button type="submit" size="sm" variant="outline" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3.5" /> 만들기
      </Button>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="text-[11px] text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

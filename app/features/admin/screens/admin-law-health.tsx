// feat-7-033 콘텐츠 헬스 통합 점수 — 4법+민소법 × 8지표 매트릭스.
// 법별 종합 점수(0~100) + 가장 낮은 지표 자동 추천 + 진입 deep link.

import { ArrowRightIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  type LawHealthMetric,
  LAW_HEALTH_METRIC_KEYS,
  LAW_HEALTH_METRIC_LABEL,
} from "~/features/admin/lib/law-health";
import { getLawHealthMatrix } from "~/features/admin/queries/law-health.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-law-health";

export const meta: Route.MetaFunction = () => [
  { title: "콘텐츠 헬스 점수 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const rows = await getLawHealthMatrix(client);
  return { role, rows };
}

function scoreTone(score: number): {
  bg: string;
  text: string;
  border: string;
} {
  if (score >= 80)
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-300/60 dark:border-emerald-700/40",
    };
  if (score >= 50)
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-300/60 dark:border-amber-700/40",
    };
  return {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300/60 dark:border-rose-700/40",
  };
}

function ratioFill(ratio: number): string {
  if (ratio >= 0.8) return "bg-emerald-500";
  if (ratio >= 0.5) return "bg-sky-500";
  if (ratio > 0) return "bg-amber-500";
  return "bg-rose-500";
}

function MetricCell({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="bg-muted hidden h-1.5 w-14 overflow-hidden rounded-full sm:block">
        <div
          className={cn("h-full rounded-full", ratioFill(ratio))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-foreground min-w-[3ch] text-right font-mono text-xs font-bold tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

export default function AdminLawHealth({ loaderData }: Route.ComponentProps) {
  const { rows, role } = loaderData;
  return (
    <AdminShell
      cluster="checks"
      role={role}
      title="콘텐츠 헬스 점수"
      desc="4법+민소법 × 8지표 매트릭스. 종합 점수가 가장 낮은 항목부터 작업하세요."
      width={1400}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map((r) => {
          const tone = scoreTone(r.healthScore);
          const weakLabel = LAW_HEALTH_METRIC_LABEL[r.weakestMetric];
          const weakPct = Math.round(r.ratios[r.weakestMetric] * 100);
          return (
            <div
              key={r.lawCode}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4 shadow-sm",
                tone.bg,
                tone.border,
              )}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold tracking-tight">
                  {r.displayLabel}
                </h2>
                <span
                  className={cn(
                    "font-mono text-[10px] font-bold tracking-[0.06em] uppercase",
                    tone.text,
                  )}
                >
                  종합
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-[40px] leading-none font-extrabold tabular-nums",
                    tone.text,
                  )}
                >
                  {r.healthScore}
                </span>
                <span
                  className={cn("text-sm font-semibold", tone.text)}
                >
                  / 100
                </span>
              </div>
              <div className="text-muted-foreground text-[11px]">
                <p>
                  가장 낮은 지표: <span className="font-semibold">{weakLabel}</span> ({weakPct}%)
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/laws/${r.lawCode}/completeness`} viewTransition>
                  지금 작업하기 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      <section className="mt-6">
        <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          8지표 매트릭스
        </p>
        <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="text-muted-foreground sticky left-0 bg-muted/60 px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    과목
                  </th>
                  {LAW_HEALTH_METRIC_KEYS.map((k) => (
                    <th
                      key={k}
                      className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase"
                    >
                      {LAW_HEALTH_METRIC_LABEL[k]}
                    </th>
                  ))}
                  <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                    종합
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.lawCode}
                    className="border-border/60 border-t first:border-t-0"
                  >
                    <td className="sticky left-0 bg-card px-3 py-2.5">
                      <Link
                        to={`/admin/laws/${r.lawCode}/completeness`}
                        className="text-foreground text-[13px] font-semibold hover:underline"
                        viewTransition
                      >
                        {r.displayLabel}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 text-[10px]">
                        조문 {r.totalArticles.toLocaleString("ko-KR")} · 판례{" "}
                        {r.totalCases.toLocaleString("ko-KR")} · 객관식{" "}
                        {r.totalMcq.toLocaleString("ko-KR")}
                      </p>
                    </td>
                    {LAW_HEALTH_METRIC_KEYS.map((k) => (
                      <td key={k} className="px-3 py-2.5 text-right">
                        <MetricCell ratio={r.ratios[k as LawHealthMetric]} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-[3ch] items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold tabular-nums",
                          scoreTone(r.healthScore).bg,
                          scoreTone(r.healthScore).text,
                          scoreTone(r.healthScore).border,
                          "border",
                        )}
                      >
                        {r.healthScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          종합 점수 = 8지표 평균 × 100. ≥80 에메랄드 / ≥50 앰버 / 그 외 로즈. 셀
          색상: ≥80% 에메랄드 / ≥50% 스카이 / 0&lt; 앰버 / 0 로즈.
        </p>
      </section>
    </AdminShell>
  );
}

// 시리즈 통계 — 회차별 요약 + 학생 × 회차 매트릭스(점수 + z-score) + 시리즈 누적 z-score 순위.
// 패턴 P4 STATS. AdminShell cluster="gs" width=1400 (매트릭스 넓게).

import {
  CrownIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR, type TableHeaderDef } from "~/features/admin/components/admin-ui";
import {
  getGsSeries,
  getSeriesMatrix,
  getSeriesRoundSummary,
  getSeriesStudentStats,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-series-stats";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.series
      ? `${loaderData.series.title} 통계 | Lidam Patent Attorney Academy`
      : "시리즈 통계 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const seriesId = params.seriesId;
  if (!seriesId) throw data("Missing seriesId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [series, roundSummary, studentStats, matrix] = await Promise.all([
    getGsSeries(client, seriesId),
    getSeriesRoundSummary(client, seriesId),
    getSeriesStudentStats(client, seriesId),
    getSeriesMatrix(client, seriesId),
  ]);
  if (!series) throw data("Series not found", { status: 404 });

  return { series, roundSummary, studentStats, matrix, role };
}

const ROUND_HEADERS: TableHeaderDef[] = [
  { label: "#", width: "3rem" },
  { label: "회차" },
  { label: "N", width: "3.5rem", align: "right" },
  { label: "평균", width: "5rem", align: "right" },
  { label: "표준편차", width: "6rem", align: "right" },
  { label: "범위", width: "9rem", align: "right" },
  { label: "", width: "4rem", align: "right" },
];

const STUDENT_HEADERS: TableHeaderDef[] = [
  { label: "순위", width: "4.5rem" },
  { label: "학생" },
  { label: "응시", width: "4.5rem", align: "right" },
  { label: "평균 점수", width: "6rem", align: "right" },
  { label: "평균 z-score", width: "9rem", align: "right" },
  { label: "편차", width: "10rem" },
];

export default function AdminGsSeriesStats({
  loaderData,
}: Route.ComponentProps) {
  const { series, roundSummary, studentStats, matrix, role } = loaderData;

  // 매트릭스: 학생 × 회차로 재구성.
  const roundIds = roundSummary.map((r) => r.roundId);
  const roundLabels = new Map<string, { label: string; idx: number }>();
  roundSummary.forEach((r, i) =>
    roundLabels.set(r.roundId, {
      label: r.roundNumber ? `${r.roundNumber}회` : `R${i + 1}`,
      idx: i,
    }),
  );
  const byStudent = new Map<
    string,
    {
      userName: string | null;
      cells: Map<string, { totalScore: number; zScore: number }>;
    }
  >();
  for (const c of matrix) {
    const cur = byStudent.get(c.userId) ?? { userName: c.userName, cells: new Map() };
    cur.cells.set(c.roundId, { totalScore: c.totalScore, zScore: c.zScore });
    byStudent.set(c.userId, cur);
  }

  return (
    <AdminShell
      cluster="gs"
      role={role}
      width={1400}
      title={series.title}
      desc={`${LAW_SUBJECTS[series.subject]?.name ?? series.subject} · 예정 ${series.expectedRounds}회 · 등록 ${roundSummary.length}회 · 채점 완료 ${roundSummary.filter((r) => r.n > 0).length}회`}
      headerRight={
        <Link
          to={`/admin/gs/series/${series.seriesId}`}
          className="text-muted-foreground hover:text-foreground text-xs font-semibold"
        >
          ← 시리즈 편집
        </Link>
      }
    >
      {/* 회차별 요약 */}
      <div className="mb-6">
        <SectionTitle title="회차별 요약" />
        <IndexTable minWidth={640} headers={ROUND_HEADERS}>
          {roundSummary.map((r, i) => (
            <TR key={r.roundId}>
              <TD mono soft>
                {r.roundNumber ?? i + 1}
              </TD>
              <TD>
                <Link
                  to={`/admin/gs/${r.roundId}/stats`}
                  className="text-link hover:underline font-medium"
                >
                  {r.title}
                </Link>
                <p className="text-muted-foreground text-[10px]">
                  {new Date(r.startAt).toLocaleDateString("ko-KR")}
                </p>
              </TD>
              <TD align="right" mono soft>
                {r.n}
              </TD>
              <TD align="right" mono>
                {r.n > 0 ? r.avgTotal : "—"}
              </TD>
              <TD align="right" mono soft>
                {r.n > 0 ? `±${r.stdev}` : "—"}
              </TD>
              <TD align="right" mono soft>
                {r.n > 0 ? `${r.minTotal} ~ ${r.maxTotal}` : "—"}
              </TD>
              <TD align="right">
                <Link
                  to={`/admin/gs/${r.roundId}/stats`}
                  className="text-link text-xs font-semibold hover:underline"
                >
                  상세
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      </div>

      {/* 시리즈 종합 순위 */}
      {studentStats.length > 0 ? (
        <div className="mb-6">
          <SectionTitle title="시리즈 종합 순위" />
          <p className="text-muted-foreground mb-2 text-[11px]">
            회차별 z-score 평균 기준. 회차마다 난이도가 달라도 객관적 비교가 가능합니다.
          </p>
          <IndexTable minWidth={640} headers={STUDENT_HEADERS}>
            {studentStats.map((s) => (
              <TR key={s.userId}>
                <TD>
                  <RankChip rank={s.seriesRank} />
                </TD>
                <TD>
                  <p className="font-medium">
                    {s.userName ?? (
                      <span className="text-muted-foreground italic">미설정</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-[10px] tabular-nums">
                    {s.userId.slice(0, 8)}
                  </p>
                </TD>
                <TD align="right" mono soft>
                  {s.roundsTaken}회
                </TD>
                <TD align="right" mono>
                  {s.avgTotal}
                </TD>
                <TD align="right">
                  <ZScoreChip z={s.avgZScore} />
                </TD>
                <TD>
                  <ZScoreBar z={s.avgZScore} />
                </TD>
              </TR>
            ))}
          </IndexTable>
        </div>
      ) : null}

      {/* 학생 × 회차 매트릭스 */}
      {byStudent.size > 0 ? (
        <div>
          <SectionTitle title="학생 × 회차 매트릭스 (z-score)" />
          <p className="text-muted-foreground mb-2 text-[11px]">
            각 셀: 회차 점수 / z-score. 색상은 z-score 기준 (녹/중립/적). 빈 셀은 해당 회차 미응시 또는 미채점.
          </p>
          <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-border bg-muted/60 border-b">
                    <th className="text-muted-foreground sticky left-0 z-10 bg-inherit min-w-[180px] px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase whitespace-nowrap">
                      학생
                    </th>
                    {roundIds.map((rid) => (
                      <th
                        key={rid}
                        className="text-muted-foreground w-[110px] px-3 py-2.5 text-center font-mono text-[11px] font-semibold tracking-[0.04em] uppercase whitespace-nowrap"
                      >
                        {roundLabels.get(rid)?.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...byStudent.entries()]
                    .sort((a, b) => {
                      const za =
                        studentStats.find((s) => s.userId === a[0])?.avgZScore ?? 0;
                      const zb =
                        studentStats.find((s) => s.userId === b[0])?.avgZScore ?? 0;
                      return zb - za;
                    })
                    .map(([uid, info]) => (
                      <tr
                        key={uid}
                        className="border-border/60 border-b transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="sticky left-0 z-10 bg-card px-3 py-2.5 text-[13px] font-medium align-middle">
                          {info.userName ?? (
                            <span className="text-muted-foreground italic">미설정</span>
                          )}
                          <p className="text-muted-foreground text-[10px] tabular-nums">
                            {uid.slice(0, 8)}
                          </p>
                        </td>
                        {roundIds.map((rid) => {
                          const cell = info.cells.get(rid);
                          if (!cell) {
                            return (
                              <td
                                key={rid}
                                className="text-muted-foreground px-3 py-2.5 text-center text-xs align-middle"
                              >
                                —
                              </td>
                            );
                          }
                          return (
                            <td
                              key={rid}
                              className={cn(
                                "px-3 py-2.5 text-center text-xs tabular-nums align-middle",
                                cell.zScore >= 1
                                  ? "bg-emerald-50 dark:bg-emerald-950/30"
                                  : cell.zScore <= -1
                                    ? "bg-rose-50 dark:bg-rose-950/30"
                                    : "",
                              )}
                            >
                              <p className="font-semibold">{cell.totalScore}</p>
                              <p
                                className={cn(
                                  "text-[10px]",
                                  cell.zScore >= 1
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : cell.zScore <= -1
                                      ? "text-rose-700 dark:text-rose-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {cell.zScore > 0 ? "+" : ""}
                                {cell.zScore.toFixed(2)}σ
                              </p>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
          아직 시리즈에 채점 완료된 응시 데이터가 없습니다.
        </div>
      )}
    </AdminShell>
  );
}

/* ── 로컬 서브컴포넌트 ──────────────────────────────────────────────────── */

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="text-muted-foreground mb-2 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
      {title}
    </p>
  );
}

function RankChip({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Chip tone="amber">
        <CrownIcon className="size-3" /> {rank}위
      </Chip>
    );
  }
  if (rank <= 3) return <Chip tone="blue">{rank}위</Chip>;
  return <Chip tone="neutral">{rank}위</Chip>;
}

function ZScoreChip({ z }: { z: number }) {
  const sign = z > 0 ? "+" : "";
  if (z >= 1) {
    return (
      <Chip tone="emerald">
        <TrendingUpIcon className="size-3" /> {sign}{z.toFixed(2)}σ
      </Chip>
    );
  }
  if (z <= -1) {
    return (
      <Chip tone="coral">
        <TrendingDownIcon className="size-3" /> {z.toFixed(2)}σ
      </Chip>
    );
  }
  return <Chip tone="neutral">{sign}{z.toFixed(2)}σ</Chip>;
}

function ZScoreBar({ z }: { z: number }) {
  const clamped = Math.max(-2, Math.min(2, z));
  const widthPct = (Math.abs(clamped) / 2) * 50;
  const tone =
    z >= 1
      ? "bg-emerald-500"
      : z <= -1
        ? "bg-rose-500"
        : "bg-muted-foreground/40";
  return (
    <div className="relative h-2 w-32 rounded-full bg-muted">
      <div className="bg-foreground/30 absolute left-1/2 top-0 h-full w-px" />
      {z >= 0 ? (
        <div
          className={cn("absolute left-1/2 top-0 h-full rounded-r-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div
          className={cn("absolute right-1/2 top-0 h-full rounded-l-full", tone)}
          style={{ width: `${widthPct}%` }}
        />
      )}
    </div>
  );
}

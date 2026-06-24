// 2차 선택과목 가이드 — 한국산업인력공단 공식 통계 기반.
// 선택과목은 P/F (50점 이상 통과, 총점 미산입). "합격률" 지표는 필수과목 실력에
// 좌우되므로 평가에 부적합 → **평균 / 과락(50 미만) 응시규모** 중심으로 안내.
import type { Route } from "./+types/electives-guide";

import { BookOpenCheckIcon, InfoIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { OFFICIAL_EXAM_STATS } from "~/features/exam-results/official-stats";

export const meta: Route.MetaFunction = () => [
  { title: "2차 선택과목 가이드 | 리담변리사학원" },
];

const SMALL_SAMPLE_THRESHOLD = 60; // 응시 sat 미만이면 표본 부족 경고

interface SubjectRow {
  subject: string;
  recentAvg: number;
  recentSat: number;
  failRateUnder50Pct: number; // sat 대비 50점 미만 응시자 비율 (sat - passers) / sat
  sampleYears: number;
  smallSample: boolean;
}

function aggregate(): SubjectRow[] {
  const map = OFFICIAL_EXAM_STATS.round2.electives_overview.by_subject;
  const rows: SubjectRow[] = [];
  for (const [subject, years] of Object.entries(map)) {
    if (years.length === 0) continue;
    const sumAvg = years.reduce((s, r) => s + r.avg, 0);
    const sumSat = years.reduce((s, r) => s + r.sat, 0);
    const sumPass = years.reduce((s, r) => s + r.passers, 0);
    const sumFail = sumSat - sumPass;
    rows.push({
      subject,
      recentAvg: Math.round((sumAvg / years.length) * 100) / 100,
      recentSat: Math.round(sumSat / years.length),
      failRateUnder50Pct:
        sumSat > 0 ? Math.round((sumFail / sumSat) * 1000) / 10 : 0,
      sampleYears: years.length,
      smallSample: sumSat / years.length < SMALL_SAMPLE_THRESHOLD,
    });
  }
  return rows.sort((a, b) => b.recentSat - a.recentSat);
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const rows = aggregate();
  return { rows, note: OFFICIAL_EXAM_STATS.round2.electives_overview.note };
}

export default function ElectivesGuide({ loaderData }: Route.ComponentProps) {
  const { rows, note } = loaderData;
  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-4 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BookOpenCheckIcon className="size-3.5" /> 2차 선택과목 가이드
        </p>
        <Link
          to="/study/passer-summaries"
          className="text-link inline-flex w-fit items-center gap-1 text-xs font-medium hover:underline"
        >
          ← 합격자 분석
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          2차 선택과목별 평균·과락
        </h1>
        <p className="text-muted-foreground text-sm">
          출처: 한국산업인력공단(큐넷) 공식 채점통계. 선택과목은 50점 이상 Pass
          / 미만 Fail (총점 미산입).{" "}
          <span className="font-medium">
            합격률 지표는 필수과목 실력에 좌우
          </span>
          되므로 평가하지 않습니다 — 평균·과락(50미만) 응시규모만 보세요.
        </p>
      </header>

      <Card className="mb-4 border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
        <CardContent className="px-4 py-3 text-xs text-amber-900 dark:text-amber-300">
          <InfoIcon className="mr-1 inline size-3.5" /> {note}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-bold tracking-tight">
            과목별 최근 평균 (응시규모 큰 순)
          </h2>
        </CardHeader>
        <CardContent className="px-3 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">과목</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  연평균 응시자
                </th>
                <th className="px-2 py-1.5 text-right font-medium">평균</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  과락률 (50점 미만)
                </th>
                <th className="px-2 py-1.5 text-right font-medium">표본</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone =
                  r.failRateUnder50Pct >= 40
                    ? "text-rose-600 dark:text-rose-400"
                    : r.failRateUnder50Pct >= 25
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400";
                return (
                  <tr
                    key={r.subject}
                    className="border-border border-t align-baseline"
                  >
                    <td className="text-foreground px-2 py-1.5 font-medium">
                      {r.subject}
                      {r.smallSample ? (
                        <span className="bg-muted text-muted-foreground ml-1.5 rounded px-1.5 py-0.5 text-[10px]">
                          표본 적음
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.recentSat.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.recentAvg.toFixed(2)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold tabular-nums ${tone}`}
                    >
                      {r.failRateUnder50Pct}%
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
                      {r.sampleYears}개년
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-4 text-xs">
        <Link to="/study/stats" className="text-link underline">
          내 학습 통계
        </Link>{" "}
        ·{" "}
        <Link to="/me/exam-results" className="text-link underline">
          내 응시 계획
        </Link>
      </p>
    </div>
  );
}

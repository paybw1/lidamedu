// MCQ 팩 응시 결과 통계 (feat-3-303).
// KPI 4 + 동영상 배너 + 유형/지문별 정답률 + 문제별 결과 테이블.
// 키트 lidam-latest/McqResultScreen 디자인.

import {
  CheckCircle2Icon,
  CircleXIcon,
  ClockIcon,
  MinusCircleIcon,
  VideoIcon,
} from "lucide-react";
import { data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { IndexCard, Pill } from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  type ProblemChoiceType,
  type ProblemFormat,
} from "~/features/problems/labels";
import {
  getPackAttemptRanking,
  getPackById,
  getPackResultStats,
  type PackAttemptRanking,
} from "~/features/mcq-packs/queries.server";
import { MCQ_PACK_KIND_LABELS } from "~/features/mcq-packs/labels";
import {
  getQuizSessionResult,
  getProblemStatsBulk,
} from "~/features/study/queries.server";

import type { Route } from "./+types/mcq-pack-result";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "응시 결과 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.pack.title} 응시 결과 | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId || !params.sessionId) {
    throw data("Missing id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });

  const result = await getQuizSessionResult(client, user.id, params.sessionId);
  if (!result) throw data("Session not found", { status: 404 });

  const aggMap = await getProblemStatsBulk(
    client,
    result.items.map((it) => it.problemId),
  );
  const aggStats: Record<
    string,
    { attempts: number; accuracyPct: number | null }
  > = {};
  for (const [pid, s] of aggMap) {
    aggStats[pid] = {
      attempts: s.attempts,
      accuracyPct: s.accuracyPct,
    };
  }

  const packStats = await getPackResultStats(
    client,
    params.packId,
    params.sessionId,
    user.id,
  );
  // feat-10-004 — 본인 점수·합격·등수 (exam 모드 응시 시에만 row 존재)
  const ranking = await getPackAttemptRanking(client, params.packId);

  return { pack, result, aggStats, packStats, ranking };
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function pct(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

const FORMAT_ORDER: ProblemFormat[] = [
  "mc_short",
  "mc_box",
  "mc_case",
  "ox",
  "blank",
  "subjective",
];

const CHOICE_TYPE_ORDER: ProblemChoiceType[] = ["statute", "precedent", "theory"];

export default function McqPackResult({ loaderData }: Route.ComponentProps) {
  const { pack, result, aggStats, packStats, ranking } = loaderData;
  const { items, attemptedCount, correctCount, totalTimeMs } = result;
  const total = items.length;
  const wrongCount = attemptedCount - correctCount;
  const skipped = total - attemptedCount;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  return (
    <LatestShell
      category="mcq"
      width="index"
      backLink={{
        to: `/latest/mcq/${pack.packId}`,
        label: "문제집으로 돌아가기",
      }}
      title={`${pack.title} — 응시 결과`}
      desc={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Pill tone="outline">{MCQ_PACK_KIND_LABELS[pack.kind]}</Pill>
          {result.session.completedAt ? (
            <Pill tone="emerald">제출 완료</Pill>
          ) : (
            <Pill tone="amber">진행 중 (저장됨)</Pill>
          )}
        </span>
      }
    >
      {ranking ? (
        <ScoreSummary ranking={ranking} passScore={pack.passScore} />
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="본인 정답률"
          value={`${accuracyPct}%`}
          hint={`정답 ${correctCount} / 응답 ${attemptedCount}`}
          tone="primary"
        />
        <KpiCard
          label="총 문항"
          value={`${total}`}
          hint={skipped > 0 ? `미응답 ${skipped}` : "전부 응답"}
        />
        <KpiCard label="오답" value={`${wrongCount}`} hint="틀린 문항" />
        <KpiCard
          label="소요 시간"
          value={totalTimeMs > 0 ? formatDuration(totalTimeMs) : "—"}
          hint="응답 합계"
          icon={<ClockIcon className="size-3" />}
        />
      </div>

      {pack.videoUrl ? (
        <div className="border-primary/15 bg-primary/[0.06] mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
          <p className="text-sm font-medium">
            강사 풀이 동영상이 등록되어 있습니다.
          </p>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 rounded-full"
          >
            <a href={pack.videoUrl} target="_blank" rel="noreferrer">
              <VideoIcon className="size-3.5" /> 동영상 풀이 보기 →
            </a>
          </Button>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <AccuracyTable
          title="유형별 정답률"
          caption="단답형 / 박스형 / 사례형 — 본인 vs 전체 평균"
          headLabel="유형"
          rows={FORMAT_ORDER.map((fmt) => ({
            key: fmt,
            label: FORMAT_LABEL[fmt],
            user: packStats?.sessionUserStats.byFormat[fmt],
            agg: packStats?.sessionAggStats.byFormat[fmt],
          }))}
        />
        <AccuracyTable
          title="지문별 정답률"
          caption="조문 / 판례 / 이론(실무) — 본인이 선택한 지문 기준"
          headLabel="지문 유형"
          rows={CHOICE_TYPE_ORDER.map((ct) => ({
            key: ct,
            label: CHOICE_TYPE_LABEL[ct],
            user: packStats?.sessionUserStats.byChoiceType[ct],
            agg: packStats?.sessionAggStats.byChoiceType[ct],
          }))}
        />
      </div>

      <p className="mb-2 text-sm font-bold tracking-tight">
        문제별 결과
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          클릭하면 문제·정답·해설을 다시 볼 수 있습니다.
        </span>
      </p>
      <IndexCard>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-border bg-muted/60 border-b">
              {["No", "정오", "출처", "본문", "본인", "전체", "시간"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i >= 4 ? "text-right" : i <= 1 ? "text-center" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const agg = aggStats[it.problemId];
              return (
                <tr
                  key={it.problemId}
                  className="border-border/60 hover:bg-muted/40 border-b transition-colors"
                >
                  <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ResultIcon isCorrect={it.isCorrect} />
                  </td>
                  <td className="px-3 py-3 text-[13px] tabular-nums">
                    {it.year
                      ? `${it.year}${it.problemNumber ? ` · ${it.problemNumber}번` : ""}`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-[13px]">
                    <span className="line-clamp-1">{it.bodySnippet}</span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 text-right text-[13px] tabular-nums",
                      it.isCorrect
                        ? "text-emerald-600"
                        : it.isCorrect === false
                          ? "text-rose-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {it.selectedChoiceIndex
                      ? `${it.selectedChoiceIndex}번`
                      : "미응답"}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-right text-[13px] tabular-nums">
                    {agg && agg.accuracyPct !== null
                      ? `${agg.accuracyPct}% (${agg.attempts})`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-[13px] tabular-nums">
                    {it.timeSpentMs ? formatDuration(it.timeSpentMs) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </IndexCard>
    </LatestShell>
  );
}

// feat-10-004 — 모의고사 점수·합격 판정·등수 요약.
function ScoreSummary({
  ranking,
  passScore,
}: {
  ranking: PackAttemptRanking;
  passScore: number | null;
}) {
  const passed = passScore !== null ? ranking.score >= passScore : null;
  return (
    <div className="border-border bg-card mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
          점수
        </span>
        <span className="text-primary text-4xl font-extrabold tabular-nums">
          {ranking.score}
        </span>
        <span className="text-muted-foreground text-sm">/ 100점</span>
        {passed === true ? (
          <Pill tone="emerald">합격</Pill>
        ) : passed === false ? (
          <Pill tone="rose">불합격</Pill>
        ) : null}
        <span className="text-muted-foreground text-xs tabular-nums">
          정답 {ranking.correct} / {ranking.total}
          {passScore !== null ? ` · 합격선 ${passScore}점` : ""}
        </span>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold tabular-nums">
          전체 {ranking.totalTakers}명 중{" "}
          <span className="text-primary">{ranking.rank}등</span>
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          백분위 {ranking.percentile} · 표준점수 z {ranking.zScore}
        </p>
      </div>
    </div>
  );
}

interface AccuracyRow {
  key: string;
  label: string;
  user?: { correct: number; total: number };
  agg?: { correct: number; total: number };
}

function AccuracyTable({
  title,
  caption,
  headLabel,
  rows,
}: {
  title: string;
  caption: string;
  headLabel: string;
  rows: AccuracyRow[];
}) {
  const visible = rows.filter((r) => r.user || r.agg);
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border border-b px-4 py-3">
        <p className="text-sm font-bold tracking-tight">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{caption}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-border bg-muted/60 border-b">
            <th className="text-muted-foreground px-4 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              {headLabel}
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              본인
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              전체
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="text-muted-foreground px-4 py-5 text-center text-xs"
              >
                집계된 데이터가 없습니다.
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr
                key={r.key}
                className="border-border/60 border-b last:border-0"
              >
                <td className="px-4 py-2.5 text-[13px]">{r.label}</td>
                <td className="px-4 py-2.5 text-right text-[13px] tabular-nums">
                  {r.user
                    ? `${pct(r.user.correct, r.user.total)} (${r.user.correct}/${r.user.total})`
                    : "—"}
                </td>
                <td className="text-muted-foreground px-4 py-2.5 text-right text-[13px] tabular-nums">
                  {r.agg ? `${pct(r.agg.correct, r.agg.total)} (${r.agg.total})` : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true)
    return (
      <CheckCircle2Icon className="inline size-4 shrink-0 text-emerald-600" />
    );
  if (isCorrect === false)
    return <CircleXIcon className="inline size-4 shrink-0 text-rose-600" />;
  return (
    <MinusCircleIcon className="text-muted-foreground inline size-4 shrink-0" />
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "primary";
  icon?: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}

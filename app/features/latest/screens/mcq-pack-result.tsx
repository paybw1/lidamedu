// MCQ 팩 응시 결과 통계 (feat-3-303).
// 전체 결과 KPI + 문제별 (전체 vs 본인) + 유형별 (단답/박스/사례) + 지문별 (조문/판례/이론).

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenCheckIcon,
  CheckCircle2Icon,
  CircleXIcon,
  ClockIcon,
  FlagIcon,
  MinusCircleIcon,
  VideoIcon,
} from "lucide-react";
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
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  type ProblemChoiceType,
  type ProblemFormat,
} from "~/features/problems/labels";
import {
  getPackById,
  getPackResultStats,
} from "~/features/mcq-packs/queries.server";
import { MCQ_PACK_KIND_LABELS } from "~/features/mcq-packs/labels";
import {
  getQuizSessionResult,
  getProblemStatsBulk,
} from "~/features/study/queries.server";

import type { Route } from "./+types/mcq-pack-result";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "응시 결과 | Lidam Edu" }];
  return [{ title: `${d.pack.title} 응시 결과 | Lidam Edu` }];
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

  return { pack, result, aggStats, packStats };
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
  const { pack, result, aggStats, packStats } = loaderData;
  const { items, attemptedCount, correctCount, totalTimeMs } = result;
  const total = items.length;
  const wrongCount = attemptedCount - correctCount;
  const skipped = total - attemptedCount;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/latest/mcq/${pack.packId}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 문제집으로 돌아가기
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{MCQ_PACK_KIND_LABELS[pack.kind]}</Badge>
          <Badge variant="default">응시 완료</Badge>
          {result.session.completedAt ? (
            <Badge variant="outline" className="ml-auto">
              <FlagIcon className="size-3" /> 제출 완료
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-auto">
              진행 중 (저장됨)
            </Badge>
          )}
        </div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpenCheckIcon className="text-primary size-6" />
          {pack.title} — 응시 결과
        </h1>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
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
          icon={<ClockIcon className="size-3.5" />}
        />
      </div>

      {pack.videoUrl ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">강사 풀이 동영상이 등록되어 있습니다.</p>
            <Button asChild size="sm" variant="outline" className="h-8">
              <a href={pack.videoUrl} target="_blank" rel="noreferrer">
                <VideoIcon className="size-3.5" /> 동영상 풀이 보기
                <ArrowRightIcon className="size-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {/* 유형별 정답률 — 단답/박스/사례 */}
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">유형별 정답률</p>
            <p className="text-muted-foreground text-xs">
              단답형 / 박스형 / 사례형 — 본인 vs 전체 평균
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">유형</TableHead>
                  <TableHead className="text-right">본인</TableHead>
                  <TableHead className="text-right">전체</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FORMAT_ORDER.map((fmt) => {
                  const u = packStats?.sessionUserStats.byFormat[fmt];
                  const a = packStats?.sessionAggStats.byFormat[fmt];
                  if (!u && !a) return null;
                  return (
                    <TableRow key={fmt}>
                      <TableCell className="text-xs">
                        {FORMAT_LABEL[fmt]}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {u ? `${pct(u.correct, u.total)} (${u.correct}/${u.total})` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {a ? `${pct(a.correct, a.total)} (${a.total})` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 지문별 정답률 — 조문/판례/이론 */}
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">지문별 정답률</p>
            <p className="text-muted-foreground text-xs">
              조문 / 판례 / 이론(실무) — 본인이 선택한 지문 기준
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">지문 유형</TableHead>
                  <TableHead className="text-right">본인</TableHead>
                  <TableHead className="text-right">전체</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CHOICE_TYPE_ORDER.map((ct) => {
                  const u = packStats?.sessionUserStats.byChoiceType[ct];
                  const a = packStats?.sessionAggStats.byChoiceType[ct];
                  if (!u && !a) return null;
                  return (
                    <TableRow key={ct}>
                      <TableCell className="text-xs">
                        {CHOICE_TYPE_LABEL[ct]}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {u ? `${pct(u.correct, u.total)} (${u.correct}/${u.total})` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {a ? `${pct(a.correct, a.total)} (${a.total})` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* 문제별 결과 — 본인 정오 + 전체 정답률 */}
      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">문제별 결과</p>
          <p className="text-muted-foreground text-xs">
            클릭하면 문제·정답·해설을 다시 볼 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">No</TableHead>
                <TableHead className="w-16"></TableHead>
                <TableHead className="w-32">출처</TableHead>
                <TableHead>본문</TableHead>
                <TableHead className="w-24 text-right">본인</TableHead>
                <TableHead className="w-24 text-right">전체</TableHead>
                <TableHead className="w-20 text-right">시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, idx) => {
                const agg = aggStats[it.problemId];
                return (
                  <TableRow key={it.problemId}>
                    <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <ResultIcon isCorrect={it.isCorrect} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {it.year ? (
                        <span className="tabular-nums">
                          {it.year}
                          {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="line-clamp-1">{it.bodySnippet}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs tabular-nums",
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
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {agg && agg.accuracyPct !== null
                        ? `${agg.accuracyPct}% (${agg.attempts})`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {it.timeSpentMs ? formatDuration(it.timeSpentMs) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true)
    return <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />;
  if (isCorrect === false)
    return <CircleXIcon className="size-4 shrink-0 text-rose-600" />;
  return <MinusCircleIcon className="text-muted-foreground size-4 shrink-0" />;
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
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          {icon}
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tracking-tight tabular-nums",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

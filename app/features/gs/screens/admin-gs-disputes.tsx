// 운영자 — 동료 채점 표준편차가 큰 (제출, 문항) 쌍 모아 보기.
// 채점자 간 의견 차이가 큰 문항(분쟁 가능성) 우선 검토용.

import { AlertTriangleIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Form, Link, data, useSearchParams } from "react-router";

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
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getGsRound,
  listGsQuestions,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";
import { listPeerStdevForRound } from "~/features/gs/queries-peer.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-disputes";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 분쟁 문항 | Lidam Edu`
      : "분쟁 문항 | Lidam Edu",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const url = new URL(request.url);
  // threshold: 0~1 의 만점 대비 비율. default 0.15. 클수록 분쟁만 좁게 본다.
  const tParam = Number(url.searchParams.get("t") ?? 0.15);
  const threshold = Number.isFinite(tParam) && tParam > 0 ? tParam : 0.15;
  // 최소 채점자 수.
  const mParam = Number(url.searchParams.get("min") ?? 2);
  const minReviewers = Number.isFinite(mParam) && mParam >= 2 ? mParam : 2;

  const [stdevRows, submissions, questions] = await Promise.all([
    listPeerStdevForRound(client, roundId),
    listGsSubmissionsForRound(client, roundId),
    listGsQuestions(client, roundId),
  ]);

  // 문항 메타 + 제출 학생 이름.
  const questionMap = new Map(questions.map((q) => [q.questionId, q]));
  const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameMap = new Map<string, string | null>();
  for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);
  const submissionAuthor = new Map(
    submissions.map((s) => [s.submissionId, s.userId] as const),
  );

  // 임계 적용: stdev / maxScore >= threshold AND count >= minReviewers.
  const filtered = stdevRows
    .map((r) => {
      const q = questionMap.get(r.questionId);
      const max = q?.maxScore ?? 100;
      return { ...r, maxScore: max, ratio: max > 0 ? r.stdev / max : 0 };
    })
    .filter((r) => r.count >= minReviewers && r.ratio >= threshold)
    .sort((a, b) => b.ratio - a.ratio);

  return {
    round,
    threshold,
    minReviewers,
    rows: filtered.map((r) => {
      const authorId = submissionAuthor.get(r.submissionId);
      return {
        submissionId: r.submissionId,
        questionId: r.questionId,
        questionTitle:
          questionMap.get(r.questionId)?.title ?? null,
        questionOrder:
          questionMap.get(r.questionId)?.orderIndex ?? 0,
        maxScore: r.maxScore,
        scores: r.scores,
        count: r.count,
        avg: r.avg,
        min: r.min,
        max: r.max,
        stdev: r.stdev,
        ratio: r.ratio,
        authorName: authorId ? nameMap.get(authorId) ?? null : null,
        authorIdShort: authorId ? authorId.slice(0, 8) : "",
      };
    }),
    totalConsidered: stdevRows.length,
  };
}

export default function AdminGsDisputes({ loaderData }: Route.ComponentProps) {
  const { round, threshold, minReviewers, rows, totalConsidered } = loaderData;
  const [searchParams] = useSearchParams();
  const tPct = Math.round(threshold * 100);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to={`/admin/gs/${round.roundId}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 회차 편집으로 돌아가기
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <AlertTriangleIcon className="size-3.5" /> 운영자 · 분쟁 문항 검토
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{round.title}</h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 동료 채점이{" "}
          {minReviewers}명 이상 도착했고, 표준편차가 만점 대비{" "}
          <span className="text-foreground font-bold">{tPct}%</span> 이상인 문항만
          노출합니다. 채점자 간 의견 차이가 큰 문항이라 운영자 직접 검토를 권합니다.
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <label className="text-xs">
              <span className="text-muted-foreground mr-1">임계 (만점 대비)</span>
              <select
                name="t"
                defaultValue={String(threshold)}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              >
                <option value="0.05">5%</option>
                <option value="0.10">10%</option>
                <option value="0.15">15% (기본)</option>
                <option value="0.20">20%</option>
                <option value="0.25">25%</option>
                <option value="0.30">30%</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground mr-1">최소 채점자</span>
              <input
                type="number"
                name="min"
                min={2}
                max={10}
                defaultValue={minReviewers}
                className="border-input bg-background h-8 w-14 rounded-md border px-2 text-xs tabular-nums"
              />
            </label>
            <button
              type="submit"
              className="border-input bg-background hover:bg-accent h-8 rounded-md border px-3 text-xs"
            >
              적용
            </button>
            <span className="text-muted-foreground ml-auto text-xs">
              집계 대상 (제출, 문항) 쌍 {totalConsidered}건 중 임계 통과{" "}
              {rows.length}건
            </span>
          </Form>
        </CardHeader>
      </Card>

      {rows.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            현재 임계를 넘는 분쟁 문항이 없습니다.
            {totalConsidered === 0
              ? " 아직 동료 채점이 도착하지 않았을 수 있습니다."
              : " 임계를 낮춰 보거나 다른 회차를 확인해 보세요."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">답안 작성자</TableHead>
                  <TableHead className="w-[80px]">문항</TableHead>
                  <TableHead className="w-[140px]">평균</TableHead>
                  <TableHead className="w-[120px]">범위</TableHead>
                  <TableHead className="w-[120px]">표준편차</TableHead>
                  <TableHead className="min-w-[180px]">개별 점수</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.submissionId}:${r.questionId}`}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {r.authorName ?? (
                          <span className="text-muted-foreground italic">
                            미설정
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-[10px] tabular-nums">
                        {r.authorIdShort}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        #{r.questionOrder + 1}
                      </Badge>
                      {r.questionTitle ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                          {r.questionTitle}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {r.avg} / {r.maxScore}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.min} ~ {r.max}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          r.ratio >= 0.25
                            ? "text-rose-700 dark:text-rose-400"
                            : r.ratio >= 0.15
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-foreground",
                        )}
                      >
                        ±{r.stdev}
                      </span>
                      <span className="text-muted-foreground ml-1 text-[10px] tabular-nums">
                        ({Math.round(r.ratio * 100)}%)
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.scores.map((s, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="h-5 text-[10px] tabular-nums"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/gs/${round.roundId}/grade/${r.submissionId}#question-${r.questionId}`}
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        검토 <ArrowRightIcon className="size-3" />
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

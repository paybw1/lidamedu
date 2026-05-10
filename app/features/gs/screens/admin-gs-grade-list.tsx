// 운영자 채점 — 회차의 제출 목록. 채점 안 된 학생부터.

import { ArrowLeftIcon, ArrowRightIcon, ClipboardCheckIcon } from "lucide-react";
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
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getGsRound,
  listGradingTargets,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-grade-list";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 채점 | Lidam Edu`
      : "GS 채점 | Lidam Edu",
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

  const targets = await listGradingTargets(client, roundId);
  // 정렬: 미채점 > 채점 중 > 완료, 그 안에서는 제출 시각 빠른 순(먼저 제출한 사람부터).
  targets.sort((a, b) => {
    const aDone = a.submission.gradedAt != null;
    const bDone = b.submission.gradedAt != null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aSubmitted = a.submission.submittedAt;
    const bSubmitted = b.submission.submittedAt;
    if (aSubmitted && bSubmitted)
      return new Date(aSubmitted).getTime() - new Date(bSubmitted).getTime();
    if (aSubmitted) return -1;
    if (bSubmitted) return 1;
    return 0;
  });

  return { round, targets };
}

export default function AdminGsGradeList({ loaderData }: Route.ComponentProps) {
  const { round, targets } = loaderData;
  const submitted = targets.filter((t) => t.submission.submittedAt != null);
  const inProgress = targets.filter((t) => t.submission.submittedAt == null);

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
          <ClipboardCheckIcon className="size-3.5" /> 운영자 채점
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{round.title}</h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출{" "}
          {submitted.length}건 · 진행 중 {inProgress.length}건
        </p>
      </header>

      {submitted.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            아직 제출된 답안이 없습니다.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">제출 목록</h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">학생</TableHead>
                  <TableHead className="w-[160px]">제출</TableHead>
                  <TableHead className="w-[140px]">진행도</TableHead>
                  <TableHead className="w-[100px]">총점</TableHead>
                  <TableHead className="w-[110px]">상태</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submitted.map((t) => (
                  <TableRow key={t.submission.submissionId}>
                    <TableCell className="font-medium">
                      {t.studentName ?? (
                        <span className="text-muted-foreground italic">
                          이름 미설정
                        </span>
                      )}
                      <p className="text-muted-foreground text-[10px] tabular-nums">
                        {t.submission.userId.slice(0, 8)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(t.submission.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <Progress
                        graded={t.answersGraded}
                        total={t.answersTotal}
                      />
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {t.submission.totalScore != null
                        ? `${t.submission.totalScore}점`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge target={t} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/gs/${round.roundId}/grade/${t.submission.submissionId}`}
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        채점 <ArrowRightIcon className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {inProgress.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              진행 중 (미제출)
            </h2>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            {inProgress.map((t) => (
              <div
                key={t.submission.submissionId}
                className="flex items-center justify-between"
              >
                <span>
                  {t.studentName ?? t.submission.userId.slice(0, 8)}
                </span>
                <span className="tabular-nums">
                  시작 {formatDateTime(t.submission.startedAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatusBadge({
  target,
}: {
  target: { submission: { gradedAt: string | null }; answersGraded: number; answersTotal: number };
}) {
  if (target.submission.gradedAt) {
    return (
      <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">
        채점 완료
      </Badge>
    );
  }
  if (target.answersGraded > 0 && target.answersGraded < target.answersTotal) {
    return (
      <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
        채점 중
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      채점 대기
    </Badge>
  );
}

function Progress({ graded, total }: { graded: number; total: number }) {
  const pct = total > 0 ? Math.round((graded / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full transition-all",
            pct === 100
              ? "bg-emerald-500"
              : pct > 0
                ? "bg-amber-500"
                : "bg-muted-foreground/30",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">
        {graded}/{total}
      </span>
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

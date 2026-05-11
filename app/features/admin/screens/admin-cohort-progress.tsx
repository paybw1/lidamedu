// 반 학생 진도 모니터링 (feat-7-010). staff 가 자기 반 학생들 학습 활동 한 화면.
// 컬럼: 이름·이메일·문제풀이·정답률·조문 열람·빈칸·최근 활동.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
  ListChecksIcon,
  TrendingUpIcon,
  UsersIcon,
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
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listCohortProgressSummary,
  type CohortMemberProgress,
} from "~/features/admin/queries/student-progress.server";

import type { Route } from "./+types/admin-cohort-progress";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 진도 | Lidam Edu" }];
  return [{ title: `${d.cohort.name} 진도 | Lidam Edu` }];
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
  if (role !== "admin" && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 조회 가능", { status: 403 });
  }

  const members = await listCohortProgressSummary(params.cohortId);
  return { cohort, members };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function formatLast(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return iso.slice(0, 10);
}

export default function AdminCohortProgress({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, members } = loaderData;

  // KPI 요약.
  const totalAttempts = members.reduce(
    (s, m) => s + m.problemsAttempted,
    0,
  );
  const totalArticles = members.reduce((s, m) => s + m.articlesViewed, 0);
  const activeCount = members.filter((m) => m.lastActivityAt !== null).length;
  const avgAccuracy = (() => {
    const withData = members.filter((m) => m.accuracyPct !== null);
    if (withData.length === 0) return null;
    const sum = withData.reduce((s, m) => s + (m.accuracyPct ?? 0), 0);
    return Math.round(sum / withData.length);
  })();

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> {cohort.name}
      </Link>
      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">진도 모니터링</Badge>
          {cohort.ownerName ? (
            <Badge variant="secondary">담당 {cohort.ownerName}</Badge>
          ) : null}
        </div>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingUpIcon className="text-primary size-6" />
          {cohort.name} — 학생 진도
        </h1>
        <p className="text-muted-foreground text-sm">
          반 멤버 {members.length}명 · 학습 활동 있음 {activeCount}명
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="활동 중 학생"
          value={`${activeCount}`}
          hint={`/ 전체 ${members.length}명`}
        />
        <KpiCard
          label="총 문제 풀이"
          value={totalAttempts.toLocaleString("ko-KR")}
          hint="distinct problem (멤버 합산)"
        />
        <KpiCard
          label="평균 정답률"
          value={avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
          hint="학생별 정답률 평균"
        />
        <KpiCard
          label="조문 열람"
          value={totalArticles.toLocaleString("ko-KR")}
          hint="distinct article (멤버 합산)"
        />
      </div>

      {members.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            반에 멤버가 없습니다. 먼저 학생을 추가하세요.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to={`/admin/cohorts/${cohort.cohortId}`}>
              <UsersIcon className="size-3.5" /> 멤버 관리
            </Link>
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead className="text-right">문제 풀이</TableHead>
                  <TableHead className="text-right">정답률</TableHead>
                  <TableHead className="text-right">조문 열람</TableHead>
                  <TableHead className="text-right">빈칸</TableHead>
                  <TableHead className="text-right">최근 활동</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, i) => (
                  <MemberRow
                    key={m.profileId}
                    member={m}
                    index={i + 1}
                    cohortId={cohort.cohortId}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MemberRow({
  member: m,
  index,
  cohortId: _cohortId,
}: {
  member: CohortMemberProgress;
  index: number;
  cohortId: string;
}) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
        {index}
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium">{m.name || "(이름 없음)"}</p>
        {m.email ? (
          <p className="text-muted-foreground text-xs">{m.email}</p>
        ) : null}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {m.problemsAttempted > 0 ? (
          <>
            {m.problemsCorrect}
            <span className="text-muted-foreground">
              {" / "}
              {m.problemsAttempted}
            </span>
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-xs font-semibold tabular-nums",
          accuracyTone(m.accuracyPct),
        )}
      >
        {m.accuracyPct !== null ? `${m.accuracyPct}%` : "—"}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {m.articlesViewed > 0 ? m.articlesViewed : "—"}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {m.blanksAttempts > 0 ? (
          <span
            className={cn(accuracyTone(m.blanksAccuracyPct))}
          >
            {m.blanksAccuracyPct !== null ? `${m.blanksAccuracyPct}%` : "—"}
            <span className="text-muted-foreground ml-1 font-normal">
              ({m.blanksAttempts})
            </span>
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3" />
          {formatLast(m.lastActivityAt)}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" variant="ghost" className="h-7">
          <Link to={`/admin/students/${m.profileId}`} viewTransition>
            상세 <ArrowRightIcon className="size-3" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          <ListChecksIcon className="size-3" />
          {label}
        </p>
        <p className="text-primary mt-1 text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}


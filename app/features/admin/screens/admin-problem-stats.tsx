// 운영자 문제 통계 — 객관식 + 정오문제 풀이 시도 집계.
// SQL RPC (admin_problem_stats_rpcs 마이그레이션) 으로 server-side aggregation.

import {
  ArrowLeftIcon,
  BarChart3Icon,
  CheckSquareIcon,
  ListChecksIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

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
  getProblemSummary,
  listMcqHardestProblems,
  listMcqYearStats,
  listOxHardestRefs,
} from "~/features/admin/queries/problem-stats.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-stats";

export const meta: Route.MetaFunction = () => [
  { title: "문제 통계 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject") ?? "patent";
  const subject: LawSubjectSlug = LAW_SUBJECT_SLUGS.includes(
    subjectParam as never,
  )
    ? (subjectParam as LawSubjectSlug)
    : "patent";
  const minAttemptsParam = url.searchParams.get("min");
  const minAttempts =
    minAttemptsParam && Number.isFinite(Number(minAttemptsParam))
      ? Math.max(1, Number(minAttemptsParam))
      : 3;

  const [summary, mcqHardest, oxHardest, yearStats] = await Promise.all([
    getProblemSummary(client, subject),
    listMcqHardestProblems(client, subject, minAttempts, 20),
    listOxHardestRefs(client, subject, minAttempts, 20),
    listMcqYearStats(client, subject),
  ]);

  return { subject, minAttempts, summary, mcqHardest, oxHardest, yearStats };
}

export default function AdminProblemStats({
  loaderData,
}: Route.ComponentProps) {
  const { subject, minAttempts, summary, mcqHardest, oxHardest, yearStats } =
    loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 운영자
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BarChart3Icon className="size-3.5" /> 운영자 모드 · 통계
        </p>
        <h1 className="text-2xl font-bold tracking-tight">문제 통계</h1>
        <p className="text-muted-foreground text-sm">
          객관식 문제와 정오문제(OX) 풀이 시도를 집계합니다. 가장 어려운 문제(낮은
          정답률) 위주로 노출되어 출제·해설 보강 우선순위를 파악할 수 있습니다.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium">과목</label>
            <select
              name="subject"
              defaultValue={subject}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              {LAW_SUBJECT_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {LAW_SUBJECTS[s].name}
                </option>
              ))}
            </select>
            <label className="ml-2 text-xs font-medium">최소 시도 수</label>
            <input
              type="number"
              name="min"
              min={1}
              defaultValue={minAttempts}
              className="border-input bg-background h-8 w-16 rounded-md border px-2 text-xs tabular-nums"
            />
            <button
              type="submit"
              className="border-input bg-background hover:bg-accent h-8 rounded-md border px-3 text-xs"
            >
              적용
            </button>
            <span className="text-muted-foreground ml-auto text-xs">
              {LAW_SUBJECTS[subject].name} · 시도 {minAttempts}회 이상만 집계
            </span>
          </Form>
        </CardHeader>
      </Card>

      {/* 요약 — MCQ + OX */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
              <ListChecksIcon className="size-3.5" /> 객관식
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="문제 수" value={summary.mcq.problemCount} />
              <Stat label="응시자" value={summary.mcq.uniqueUsers} suffix="명" />
              <Stat label="시도" value={summary.mcq.attemptCount} suffix="회" />
              <Stat
                label="평균 정답률"
                value={`${summary.mcq.accuracy}%`}
                tone={accuracyTone(summary.mcq.accuracy)}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
              <CheckSquareIcon className="size-3.5" /> 정오문제
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat
                label="후보 / 노출"
                value={`${summary.ox.refTotal} / ${summary.ox.refActive}`}
              />
              <Stat label="응시자" value={summary.ox.uniqueUsers} suffix="명" />
              <Stat label="시도" value={summary.ox.attemptCount} suffix="회" />
              <Stat
                label="평균 정답률"
                value={`${summary.ox.accuracy}%`}
                tone={accuracyTone(summary.ox.accuracy)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 연도별 정답률 (MCQ) */}
      {yearStats.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              연도별 정답률 (객관식)
            </h2>
            <p className="text-muted-foreground text-xs">
              해당 연도 출제 문제에 대한 모든 시도 집계.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">연도</TableHead>
                  <TableHead className="w-[100px]">문제 수</TableHead>
                  <TableHead className="w-[100px]">시도</TableHead>
                  <TableHead className="w-[100px]">정답률</TableHead>
                  <TableHead>분포</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearStats.map((y) => (
                  <TableRow key={y.year}>
                    <TableCell className="font-medium tabular-nums">
                      {y.year}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {y.problemCount}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {y.attempts}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold tabular-nums",
                        accuracyTextClass(y.accuracy),
                      )}
                    >
                      {y.accuracy}%
                    </TableCell>
                    <TableCell>
                      <AccuracyBar accuracy={y.accuracy} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* MCQ 어려운 문제 TOP */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              가장 어려운 객관식 문제
            </h2>
            <Badge variant="outline" className="text-[10px]">
              정답률 오름차순 · TOP {mcqHardest.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {mcqHardest.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              집계 가능한 시도가 부족합니다. 최소 시도 수를 낮춰 보세요.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">출처/연도</TableHead>
                  <TableHead className="min-w-[300px]">본문</TableHead>
                  <TableHead className="w-[140px]">조문</TableHead>
                  <TableHead className="w-[70px]">시도</TableHead>
                  <TableHead className="w-[80px]">응시자</TableHead>
                  <TableHead className="w-[100px]">정답률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcqHardest.map((p) => (
                  <TableRow key={p.problemId}>
                    <TableCell className="text-xs">
                      <div className="font-medium tabular-nums">
                        {p.year ?? "—"}
                        {p.problemNumber ? ` · ${p.problemNumber}번` : ""}
                      </div>
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                        {p.origin}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/problems/${p.problemId}`}
                        className="font-serif text-sm leading-snug hover:underline"
                      >
                        {p.bodySnippet}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.primaryArticleNumber ? (
                        <Link
                          to={`/subjects/${subject}/articles/${p.primaryArticleNumber}`}
                          className="text-primary hover:underline"
                        >
                          {p.primaryArticleLabel ?? p.primaryArticleNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.attempts}</TableCell>
                    <TableCell className="tabular-nums">
                      {p.uniqueUsers}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold tabular-nums",
                        accuracyTextClass(p.accuracy),
                      )}
                    >
                      {p.accuracy}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* OX 어려운 지문 TOP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              가장 어려운 정오 지문
            </h2>
            <Badge variant="outline" className="text-[10px]">
              정답률 오름차순 · TOP {oxHardest.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {oxHardest.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              집계 가능한 OX 시도가 부족합니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">출처/연도</TableHead>
                  <TableHead className="w-[60px]">유형</TableHead>
                  <TableHead className="min-w-[300px]">지문</TableHead>
                  <TableHead className="w-[60px]">정답</TableHead>
                  <TableHead className="w-[140px]">조문</TableHead>
                  <TableHead className="w-[70px]">시도</TableHead>
                  <TableHead className="w-[100px]">정답률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oxHardest.map((it) => (
                  <TableRow key={`${it.refType}:${it.refId}`}>
                    <TableCell className="text-xs">
                      <div className="font-medium tabular-nums">
                        {it.year ?? "—"}
                        {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                      </div>
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                        {it.origin}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {it.refType === "choice" ? "보기" : "박스"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/problems/${it.problemId}`}
                        className="font-serif text-sm leading-snug hover:underline"
                      >
                        {it.bodySnippet}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold",
                          it.oxTruth === "O"
                            ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {it.oxTruth}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {it.relatedArticleNumber ? (
                        <Link
                          to={`/subjects/${subject}/articles/${it.relatedArticleNumber}`}
                          className="text-primary hover:underline"
                        >
                          {it.relatedArticleLabel ?? it.relatedArticleNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{it.attempts}</TableCell>
                    <TableCell
                      className={cn(
                        "font-semibold tabular-nums",
                        accuracyTextClass(it.accuracy),
                      )}
                    >
                      {it.accuracy}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-foreground text-lg font-bold tabular-nums",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
        {suffix ? (
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function AccuracyBar({ accuracy }: { accuracy: number }) {
  const clamped = Math.max(0, Math.min(100, accuracy));
  return (
    <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          clamped < 40
            ? "bg-rose-500"
            : clamped < 70
              ? "bg-amber-500"
              : "bg-emerald-500",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function accuracyTone(accuracy: number): "ok" | "warn" | "bad" {
  if (accuracy < 40) return "bad";
  if (accuracy < 70) return "warn";
  return "ok";
}

function accuracyTextClass(accuracy: number): string {
  if (accuracy < 40) return "text-rose-600 dark:text-rose-400";
  if (accuracy < 70) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

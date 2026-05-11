// 한 학생 상세 — 과목별 진도/통계, 최근 활동, 빈칸 (feat-7-010).
// staff 권한: admin 전부, instructor 는 본인 cohort 멤버만.

import {
  ArrowLeftIcon,
  BookmarkIcon,
  ClockIcon,
  FileTextIcon,
  GavelIcon,
  ListChecksIcon,
  MailIcon,
  TrendingUpIcon,
  UserIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
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
import { getStaffRole } from "~/features/laws/queries.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { getStudentDetail } from "~/features/admin/queries/student-progress.server";

import type { Route } from "./+types/admin-student-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.student) return [{ title: "학생 상세 | Lidam Edu" }];
  return [{ title: `${d.student.name} 학생 진도 | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.profileId) throw data("Missing profileId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // instructor 면 본인 소속 cohort 의 멤버인지 확인.
  if (role !== "admin") {
    const { data: rows } = await adminClient
      .from("cohort_members")
      .select("cohort_id, cohorts!inner(owner_id)")
      .eq("profile_id", params.profileId);
    const ownsAnyCohort = (rows ?? []).some(
      (r) => r.cohorts?.owner_id === user.id,
    );
    if (!ownsAnyCohort) {
      throw data("이 학생을 조회할 권한이 없습니다.", { status: 403 });
    }
  }

  const student = await getStudentDetail(params.profileId);
  if (!student) throw data("Student not found", { status: 404 });
  return { student };
}

function accuracyTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-lime-600 dark:text-lime-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export default function AdminStudentDetail({
  loaderData,
}: Route.ComponentProps) {
  const { student } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/cohorts"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 반 목록
      </Link>

      <header className="mb-6 space-y-2">
        <Badge variant="outline" className="gap-1">
          <UserIcon className="size-3" />
          {student.role === "admin"
            ? "원장"
            : student.role === "instructor"
              ? "강사"
              : "수험생"}
        </Badge>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingUpIcon className="text-primary size-6" />
          {student.name || "(이름 없음)"}
        </h1>
        {student.email ? (
          <p className="text-muted-foreground inline-flex items-center gap-1 text-sm">
            <MailIcon className="size-3.5" />
            {student.email}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          가입 {student.joinedAt.slice(0, 10)}
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<ListChecksIcon className="size-3" />}
          label="문제 풀이"
          value={`${student.totals.problemsCorrect} / ${student.totals.problemsAttempted}`}
          hint="정답 / 응답 (distinct)"
        />
        <KpiCard
          icon={<TrendingUpIcon className="size-3" />}
          label="전체 정답률"
          value={
            student.totals.accuracyPct !== null
              ? `${student.totals.accuracyPct}%`
              : "—"
          }
          hint="distinct problem 기준"
          tone={accuracyTone(student.totals.accuracyPct)}
        />
        <KpiCard
          icon={<FileTextIcon className="size-3" />}
          label="조문 열람"
          value={`${student.totals.articlesViewed}`}
          hint="distinct article"
        />
        <KpiCard
          icon={<BookmarkIcon className="size-3" />}
          label="빈칸 정답률"
          value={
            student.blanks.accuracyPct !== null
              ? `${student.blanks.accuracyPct}%`
              : "—"
          }
          hint={`정답 ${student.blanks.correct} / 응답 ${student.blanks.attempts}`}
          tone={accuracyTone(student.blanks.accuracyPct)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold">법률 과목별 진도</p>
              <p className="text-muted-foreground text-xs">
                과목별 조문 열람 + 문제 풀이/정답률
              </p>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {student.bySubject.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    법률 과목 학습 기록이 없습니다.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">조문 열람</TableHead>
                      <TableHead className="text-right">문제</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.bySubject.map((s) => (
                      <TableRow key={s.lawCode}>
                        <TableCell className="text-sm font-medium">
                          {s.lawName}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {s.articlesViewed}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {s.problemsAttempted > 0
                            ? `${s.problemsCorrect}/${s.problemsAttempted}`
                            : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold tabular-nums",
                            accuracyTone(s.accuracyPct),
                          )}
                        >
                          {s.accuracyPct !== null ? `${s.accuracyPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {student.byScience.length > 0 ? (
            <Card>
              <CardHeader>
                <p className="text-sm font-semibold">자연과학 진도</p>
                <p className="text-muted-foreground text-xs">
                  선택 과목 풀이/정답률
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-right">풀이/총</TableHead>
                      <TableHead className="text-right">정답률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.byScience.map((s) => (
                      <TableRow key={s.slug}>
                        <TableCell className="text-sm font-medium">
                          {s.name}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {s.attempted} / {s.total}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold tabular-nums",
                            accuracyTone(s.accuracyPct),
                          )}
                        >
                          {s.accuracyPct !== null ? `${s.accuracyPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <p className="inline-flex items-center gap-1 text-sm font-semibold">
              <ClockIcon className="text-primary size-4" /> 최근 활동
            </p>
            <p className="text-muted-foreground text-xs">최근 12건</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {student.recent.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  학습 활동 기록이 없습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {student.recent.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 px-4 py-2.5">
                    <ActivityIcon type={r.targetType} />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium">
                        {labelForType(r.targetType)}
                        {r.subject ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {r.subject}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {r.occurredAt.slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function labelForType(type: string): string {
  if (type === "article") return "조문 학습";
  if (type === "case") return "판례 학습";
  if (type === "problem") return "문제 풀이";
  return type || "활동";
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "text-muted-foreground size-3.5 shrink-0 mt-0.5";
  if (type === "article") return <FileTextIcon className={cls} />;
  if (type === "case") return <GavelIcon className={cls} />;
  if (type === "problem") return <ListChecksIcon className={cls} />;
  return <ClockIcon className={cls} />;
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: string;
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
            tone ?? "text-primary",
          )}
        >
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

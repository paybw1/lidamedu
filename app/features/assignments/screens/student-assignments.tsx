// feat-7-021 — 학생 본인 과제 목록.
import type { Route } from "./+types/student-assignments";

import { ArrowRightIcon, CalendarIcon, CheckCircle2Icon } from "lucide-react";
import { Link, data } from "react-router";

import { AreaEyebrow, StudentShell } from "~/core/components/student";
import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  ASSIGNMENT_STATUS_LABEL,
  type AssignmentStatus,
} from "~/features/assignments/labels";
import { listStudentAssignments } from "~/features/assignments/queries.server";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  attendanceRatePct,
} from "~/features/attendance/labels";
import { getMyAttendance } from "~/features/attendance/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "과제 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const [assignments, attendance] = await Promise.all([
    listStudentAssignments(user.id),
    getMyAttendance(client, user.id),
  ]);
  return { assignments, attendance };
}

const STATUS_TONE: Record<AssignmentStatus, string> = {
  pending: "text-muted-foreground",
  partial: "text-amber-600 dark:text-amber-400",
  completed: "text-emerald-600 dark:text-emerald-400",
};

export default function StudentAssignments({
  loaderData,
}: Route.ComponentProps) {
  const { assignments, attendance } = loaderData;
  const attendanceRate = attendance ? attendanceRatePct(attendance.counts) : null;
  const now = Date.now();
  const pending = assignments.filter(
    (a) => a.submission?.status !== "completed",
  );
  const done = assignments.filter((a) => a.submission?.status === "completed");

  return (
    <StudentShell>
      <header className="mb-6">
        <AreaEyebrow area="manage" />
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          과제
        </h1>
        <p className="text-ink-soft mt-2 text-sm">
          마감이 가까운 과제부터 보여 드립니다. 완수는 자동으로 판정됩니다.
        </p>
      </header>

      {/* feat-7-043 — 내 출결 요약 (종합반 오프라인 수업) */}
      {attendance && attendance.recorded > 0 ? (
        <section className="mb-6">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
              <div>
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                  내 출결
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {attendanceRate !== null ? `${attendanceRate}%` : "—"}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    출석률 · 기록 {attendance.recorded}회
                    {attendance.counts.absent > 0
                      ? ` · 결석 ${attendance.counts.absent}`
                      : ""}
                    {attendance.counts.late > 0
                      ? ` · 지각 ${attendance.counts.late}`
                      : ""}
                  </span>
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                {attendance.recent.map((r) => (
                  <span
                    key={`${r.sessionNo}-${r.heldOn}`}
                    title={`${r.sessionNo}회차 · ${r.heldOn}${r.title ? ` · ${r.title}` : ""}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      r.status
                        ? ATTENDANCE_STATUS_TONE[r.status]
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.sessionNo}회{" "}
                    {r.status ? ATTENDANCE_STATUS_LABEL[r.status] : "미기록"}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">
          진행 중 ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            진행 중인 과제가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((a) => (
              <AssignmentCard
                key={a.assignmentId}
                a={a}
                overdue={new Date(a.dueAt).getTime() < now}
              />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">완수 ({done.length})</h2>
          <div className="space-y-2">
            {done.map((a) => (
              <AssignmentCard key={a.assignmentId} a={a} overdue={false} />
            ))}
          </div>
        </section>
      ) : null}
    </StudentShell>
  );
}

function AssignmentCard({
  a,
  overdue,
}: {
  a: Awaited<
    ReturnType<typeof import("../queries.server").listStudentAssignments>
  >[number];
  overdue: boolean;
}) {
  const sub = a.submission;
  const status: AssignmentStatus = sub?.status ?? "pending";
  const pct =
    sub && sub.totalItems > 0
      ? Math.round((sub.completedItems / sub.totalItems) * 100)
      : 0;
  return (
    <Link
      to={`/assignments/${a.assignmentId}`}
      viewTransition
      className="group block"
    >
      <Card className="hover:border-primary transition-colors">
        <CardHeader className="px-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{a.title}</p>
            <Badge
              variant={
                status === "completed"
                  ? "default"
                  : status === "partial"
                    ? "secondary"
                    : "outline"
              }
              className={cn("text-[10px]", STATUS_TONE[status])}
            >
              {status === "completed" ? (
                <CheckCircle2Icon className="size-3" />
              ) : null}
              {ASSIGNMENT_STATUS_LABEL[status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 px-4 pb-3">
          <div className="bg-muted/40 relative h-2 overflow-hidden rounded">
            <div
              className={cn(
                "absolute inset-y-0 left-0 transition-all",
                status === "completed"
                  ? "bg-emerald-500"
                  : status === "partial"
                    ? "bg-amber-500"
                    : "bg-muted-foreground/40",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarIcon className="size-3" />
              마감 {a.dueAt.slice(0, 16).replace("T", " ")}
              {overdue ? (
                <span className="text-rose-600 dark:text-rose-400">(지남)</span>
              ) : null}
            </span>
            <span>
              진척 {sub?.completedItems ?? 0}/{sub?.totalItems ?? a.itemCount}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs">
              풀러 가기 <ArrowRightIcon className="size-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

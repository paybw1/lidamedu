// feat-12 현장강의 일정 운영자 목록 — /admin/lecture-schedules.
import { PlusIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { AdminRowControls } from "../components/admin-row-controls";
import { FORMAT_LABEL, STATUS_LABEL, type LectureFormat, type ScheduleStatus } from "../labels";
import { listSchedules } from "../queries.server";

import type { Route } from "./+types/admin-schedules";

export function meta() {
  return [{ title: "현장강의 일정 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const schedules = await listSchedules(client, { includeUnpublished: true });
  return { role, schedules };
}

export default function AdminSchedules({ loaderData }: Route.ComponentProps) {
  const { role, schedules } = loaderData;
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="현장강의 일정 관리"
      desc="랜딩·시간표에 노출되는 개강 일정을 등록·편집합니다. 순서(↑/↓)는 같은 개강일 내 표시 순서입니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/lecture-schedules/new">
            <PlusIcon className="size-4" /> 일정 등록
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {schedules.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 일정이 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {schedules.map((s, i) => (
              <li key={s.schedule_id} className="flex items-center gap-3 px-3 py-3">
                <AdminRowControls
                  entity="schedule"
                  id={s.schedule_id}
                  isFirst={i === 0}
                  isLast={i === schedules.length - 1}
                />
                <Link
                  to={`/admin/lecture-schedules/${s.schedule_id}/edit`}
                  className="hover:bg-muted/40 flex flex-1 items-center gap-3 rounded-lg px-2 py-1"
                >
                  <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                    {s.start_date ?? "미정"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">
                      {s.subject_label} · {s.title}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {s.instructor_name} · {FORMAT_LABEL[s.format as LectureFormat]} ·{" "}
                      {s.enrolled}/{s.capacity}석
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {STATUS_LABEL[s.status as ScheduleStatus]}
                  </Badge>
                  {s.published ? (
                    <Badge className="shrink-0 text-[11px]">공개</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      비공개
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

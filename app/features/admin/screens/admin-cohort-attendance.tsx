// feat-7-043 — 출결 대장 (운영자). 회차 목록·추가 + 학생별 누계 출석률.

import {
  CalendarPlusIcon,
  ClipboardCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  ATTENDANCE_STATUS_LABEL,
  attendanceRatePct,
  type AttendanceCounts,
} from "~/features/attendance/labels";
import {
  getCohortAttendanceSummary,
  listClassSessions,
} from "~/features/attendance/queries.server";
import { getCohortById, listCohortMembers } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohort-attendance";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "출결 대장 | 리담변리사학원" }];
  return [{ title: `${d.cohort.name} 출결 대장 | 리담변리사학원` }];
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
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const [sessions, members, summary] = await Promise.all([
    listClassSessions(client, params.cohortId),
    listCohortMembers(client, params.cohortId),
    getCohortAttendanceSummary(client, params.cohortId),
  ]);

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;

  return {
    cohort,
    role,
    sessions,
    students: members
      .filter((m) => m.role === "student")
      .map((m) => ({
        profileId: m.profileId,
        name: m.name,
        summary: summary.get(m.profileId) ?? null,
      })),
    nextNo: sessions.reduce((m, s) => Math.max(m, s.sessionNo), 0) + 1,
    today,
  };
}

function rateTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export default function AdminCohortAttendance({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, role, sessions, students, nextNo, today } = loaderData;
  const base = `/admin/cohorts/${cohort.cohortId}/attendance`;

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={960}
      title={`${cohort.name} — 출결 대장`}
      desc={`오프라인 수업 회차별 출석부. 회차 ${sessions.length} · 학생 ${students.length}명.`}
    >
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 반 상세
      </Link>

      {/* 회차 추가 */}
      <NewSessionForm cohortId={cohort.cohortId} nextNo={nextNo} today={today} />

      {/* 회차 목록 */}
      <section className="mt-4 space-y-3">
        <h2 className="text-base font-semibold">수업 회차 ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
            등록된 회차가 없습니다. 위에서 첫 수업 회차를 추가하세요.
          </p>
        ) : (
          <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
            {sessions.map((s) => (
              <SessionRow
                key={s.classSessionId}
                s={s}
                base={base}
                studentCount={students.length}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 학생별 누계 */}
      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">학생별 출석률</h2>
        <p className="text-muted-foreground text-xs">
          출석률 = 결석 제외 비율(지각·온라인 대체·공결은 출석 인정). 미기록
          회차는 계산에서 제외됩니다.
        </p>
        <IndexTable
          minWidth={640}
          headers={[
            { label: "학생" },
            { label: "출석", align: "right", width: "4rem" },
            { label: "지각", align: "right", width: "4rem" },
            { label: "결석", align: "right", width: "4rem" },
            { label: "온라인", align: "right", width: "4.5rem" },
            { label: "공결", align: "right", width: "4rem" },
            { label: "출석률", align: "right", width: "5rem" },
          ]}
        >
          {students.map((st) => {
            const c: AttendanceCounts = st.summary?.counts ?? {
              present: 0,
              late: 0,
              absent: 0,
              online: 0,
              excused: 0,
            };
            const pct = attendanceRatePct(c);
            return (
              <TR key={st.profileId}>
                <TD>
                  <Link
                    to={`/admin/students/${st.profileId}`}
                    viewTransition
                    className="hover:text-link text-[13px] font-medium"
                  >
                    {st.name}
                  </Link>
                </TD>
                <TD align="right" mono>{c.present}</TD>
                <TD align="right" mono>{c.late}</TD>
                <TD align="right" mono>
                  <span className={c.absent > 0 ? "font-bold text-rose-600 dark:text-rose-400" : undefined}>
                    {c.absent}
                  </span>
                </TD>
                <TD align="right" mono>{c.online}</TD>
                <TD align="right" mono>{c.excused}</TD>
                <TD align="right" mono>
                  <span className={cn("font-bold", rateTone(pct))}>
                    {pct === null ? "—" : `${pct}%`}
                  </span>
                </TD>
              </TR>
            );
          })}
        </IndexTable>
      </section>
    </AdminShell>
  );
}

// ★안정 identity 필수 — 성공 useEffect deps([fetcher.data, reload])에 사용. 매 렌더 새
// 함수면 fetcher.data.ok 가 계속 참인 동안 effect 가 무한 재실행돼 화면이 멈춘다.
function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<() => void>(() => {});
  ref.current = () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
  return useCallback(() => ref.current(), []);
}

function NewSessionForm({
  cohortId,
  nextNo,
  today,
}: {
  cohortId: string;
  nextNo: number;
  today: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/attendance"
      className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="create_session" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <div className="flex flex-col gap-1">
        <Label className="text-[11px]">회차</Label>
        <Input
          name="sessionNo"
          type="number"
          min={1}
          max={999}
          defaultValue={nextNo}
          className="h-9 w-20 text-xs tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[11px]">수업일</Label>
        <Input
          name="heldOn"
          type="date"
          defaultValue={today}
          className="h-9 w-36 text-xs tabular-nums"
        />
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <Label className="text-[11px]">수업명 (선택)</Label>
        <Input
          name="title"
          maxLength={200}
          placeholder="예: 특허법 3강 — 특허요건"
          className="h-9 text-xs"
        />
      </div>
      <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
        <CalendarPlusIcon className="size-3.5" /> 회차 추가
      </Button>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </fetcher.Form>
  );
}

function SessionRow({
  s,
  base,
  studentCount,
}: {
  s: Awaited<ReturnType<typeof listClassSessions>>[number];
  base: string;
  studentCount: number;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  const unrecorded = Math.max(0, studentCount - s.recordedCount);
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="text-muted-foreground w-10 text-center font-mono text-xs tabular-nums">
        {s.sessionNo}회
      </span>
      <span className="text-xs font-medium tabular-nums">{s.heldOn}</span>
      <span className="min-w-0 flex-1 truncate text-xs">{s.title ?? ""}</span>
      <span className="text-muted-foreground text-[11px] tabular-nums">
        {s.recordedCount === 0 ? (
          "미기록"
        ) : (
          <>
            {ATTENDANCE_STATUS_LABEL.present} {s.counts.present}
            {s.counts.late > 0 ? ` · 지각 ${s.counts.late}` : ""}
            {s.counts.absent > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">
                {" "}
                · 결석 {s.counts.absent}
              </span>
            ) : null}
            {s.counts.online > 0 ? ` · 온라인 ${s.counts.online}` : ""}
            {s.counts.excused > 0 ? ` · 공결 ${s.counts.excused}` : ""}
            {unrecorded > 0 ? ` · 미기록 ${unrecorded}` : ""}
          </>
        )}
      </span>
      <Button asChild size="sm" variant={s.recordedCount === 0 ? "default" : "outline"}>
        <Link to={`${base}/${s.classSessionId}`}>
          <ClipboardCheckIcon className="size-3.5" /> 출석 체크
        </Link>
      </Button>
      <fetcher.Form method="post" action="/api/admin/attendance">
        <input type="hidden" name="intent" value="delete_session" />
        <input type="hidden" name="classSessionId" value={s.classSessionId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          onClick={(e) => {
            if (!confirm(`${s.sessionNo}회차를 삭제(soft)하시겠습니까? 출석 기록은 보존됩니다.`)) {
              e.preventDefault();
            }
          }}
          disabled={fetcher.state !== "idle"}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

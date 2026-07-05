// feat-7-043 — 회차별 출석 체크 (운영자). "전원 출석" 후 예외만 변경하는 관행 최적화 그리드.

import { CheckIcon, SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  type AttendanceStatus,
} from "~/features/attendance/labels";
import {
  getClassSession,
  listSessionAttendance,
} from "~/features/attendance/queries.server";
import { getCohortById, listCohortMembers } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-attendance-check";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "출석 체크 | 리담변리사학원" }];
  return [
    { title: `${d.session.sessionNo}회차 출석 체크 | 리담변리사학원` },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId || !params.classSessionId) {
    throw data("Missing params", { status: 404 });
  }
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

  const session = await getClassSession(client, params.classSessionId);
  if (!session || session.cohortId !== params.cohortId) {
    throw data("Session not found", { status: 404 });
  }

  const [members, records] = await Promise.all([
    listCohortMembers(client, params.cohortId),
    listSessionAttendance(client, params.classSessionId),
  ]);

  return {
    cohort,
    session,
    role,
    students: members
      .filter((m) => m.role === "student")
      .map((m) => ({ profileId: m.profileId, name: m.name })),
    records,
  };
}

interface RowState {
  status: AttendanceStatus | null; // null = 미기록
  note: string;
}

export default function AdminAttendanceCheck({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, session, role, students, records } = loaderData;
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher<{ ok?: true; saved?: number; error?: string }>();

  const [rows, setRows] = useState<Map<string, RowState>>(() => {
    const byUser = new Map(records.map((r) => [r.profileId, r]));
    const m = new Map<string, RowState>();
    for (const st of students) {
      const r = byUser.get(st.profileId);
      m.set(st.profileId, {
        status: r?.status ?? null,
        note: r?.note ?? "",
      });
    }
    return m;
  });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      navigate(location.pathname, { replace: true, preventScrollReset: true });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname]);

  const setRow = (id: string, next: RowState) =>
    setRows((prev) => new Map(prev).set(id, next));

  const markAllPresent = () =>
    setRows((prev) => {
      const next = new Map(prev);
      for (const [id, r] of next) {
        if (r.status === null) next.set(id, { ...r, status: "present" });
      }
      return next;
    });

  const entryCount = [...rows.values()].filter((r) => r.status !== null).length;

  const save = () => {
    const entries = students
      .map((st) => {
        const r = rows.get(st.profileId);
        if (!r || r.status === null) return null;
        return {
          profileId: st.profileId,
          status: r.status,
          note: r.note.trim() || null,
        };
      })
      .filter(Boolean);
    if (entries.length === 0) return;
    const fd = new FormData();
    fd.set("intent", "save_attendance");
    fd.set("classSessionId", session.classSessionId);
    fd.set("entries", JSON.stringify(entries));
    fetcher.submit(fd, { method: "post", action: "/api/admin/attendance" });
  };

  const counts = ATTENDANCE_STATUSES.map((s) => ({
    status: s,
    n: [...rows.values()].filter((r) => r.status === s).length,
  }));

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={860}
      title={`${session.sessionNo}회차 출석 체크`}
      desc={`${cohort.name} · ${session.heldOn}${session.title ? ` · ${session.title}` : ""}`}
      headerRight={
        <Button
          size="sm"
          onClick={save}
          disabled={entryCount === 0 || fetcher.state !== "idle"}
        >
          <SaveIcon className="size-3.5" /> {entryCount}명 저장
        </Button>
      }
    >
      <Link
        to={`/admin/cohorts/${cohort.cohortId}/attendance`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 출결 대장
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={markAllPresent}>
          <CheckIcon className="size-3.5" /> 미기록 전원 출석으로
        </Button>
        <p className="text-muted-foreground text-xs tabular-nums">
          {counts
            .filter((c) => c.n > 0)
            .map((c) => `${ATTENDANCE_STATUS_LABEL[c.status]} ${c.n}`)
            .join(" · ") || "아직 기록 없음"}
        </p>
      </div>

      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="mb-3 text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      {fetcher.data && fetcher.data.ok ? (
        <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-400">
          ✓ {fetcher.data.saved ?? 0}명 저장됨
        </p>
      ) : null}

      {students.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          이 반에 학생이 없습니다.
        </p>
      ) : (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
          {students.map((st) => {
            const r = rows.get(st.profileId) ?? { status: null, note: "" };
            return (
              <li
                key={st.profileId}
                className={cn(
                  "flex flex-wrap items-center gap-2 px-3 py-2",
                  r.status === null && "opacity-60",
                )}
              >
                <span className="w-28 truncate text-[13px] font-medium">
                  {st.name}
                </span>
                <div className="flex gap-1">
                  {ATTENDANCE_STATUSES.map((s) => {
                    const active = r.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setRow(st.profileId, {
                            ...r,
                            status: active ? null : s,
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          active
                            ? cn("border-transparent", ATTENDANCE_STATUS_TONE[s])
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {ATTENDANCE_STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={r.note}
                  onChange={(e) =>
                    setRow(st.profileId, { ...r, note: e.target.value })
                  }
                  placeholder="비고"
                  maxLength={500}
                  className="border-input bg-background h-7 min-w-0 flex-1 rounded-md border px-2 text-[11px]"
                />
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}

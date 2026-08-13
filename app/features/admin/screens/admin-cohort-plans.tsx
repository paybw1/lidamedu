// Phase 3 — 반 월간 계획 현황 + 승인 큐 (/admin/cohorts/:cohortId/plans).
// 제출된 계획 우선 정렬 — 학생 클릭 → 진단·검토·승인 한 흐름(plan review).

import type { Route } from "./+types/admin-cohort-plans";

import { ArrowRightIcon, ClipboardCheckIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { getCohortById, listCohortMembers } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  PLAN_STATUS_LABEL,
  currentMonthPeriod,
} from "~/features/study-plans/labels";
import { listCohortPlanOverview } from "~/features/study-plans/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "월간 계획 현황 | 리담변리사학원" },
];

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

  const { periodStart, periodEnd } = currentMonthPeriod();
  const [members, overview] = await Promise.all([
    listCohortMembers(client, params.cohortId),
    listCohortPlanOverview(client, params.cohortId, periodStart),
  ]);
  const students = members.filter((m) => m.role === "student");

  // 진단 입력 여부 배지.
  const { data: diagRows } = await client
    .from("student_diagnostics")
    .select("user_id")
    .in("user_id", students.map((s) => s.profileId));
  const hasDiag = new Set((diagRows ?? []).map((r) => r.user_id));

  const rows = students
    .map((s) => {
      const entry = overview.get(s.profileId);
      return {
        profileId: s.profileId,
        name: s.name,
        hasDiagnostics: hasDiag.has(s.profileId),
        status: entry?.plan.status ?? null,
        version: entry?.plan.version ?? null,
        itemCount: entry?.itemCount ?? 0,
        submittedAt: entry?.plan.submittedAt ?? null,
      };
    })
    .sort((a, b) => {
      const rank = (s: string | null) =>
        s === "submitted" ? 0 : s === "revision_requested" ? 1 : s === "draft" ? 2 : s === "approved" ? 3 : 4;
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
    });

  return { cohort, role, rows, periodStart, periodEnd };
}

export default function AdminCohortPlans({ loaderData }: Route.ComponentProps) {
  const { cohort, role, rows, periodStart, periodEnd } = loaderData;
  const base = `/admin/cohorts/${cohort.cohortId}`;
  const submittedCount = rows.filter((r) => r.status === "submitted").length;

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={1000}
      title={`${cohort.name} — 월간 계획`}
      desc={`${periodStart} ~ ${periodEnd} · 제출 대기 ${submittedCount}명`}
    >
      <Link
        to={base}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 반 상세로
      </Link>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          이 반에 학생이 없습니다.
        </p>
      ) : (
        <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="px-3 py-2 font-semibold">학생</th>
                <th className="px-2 py-2 font-semibold">진단</th>
                <th className="px-2 py-2 font-semibold">계획 상태</th>
                <th className="px-2 py-2 text-right font-semibold">항목</th>
                <th className="px-2 py-2 font-semibold">제출일</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.profileId}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="px-2 py-2">
                    {r.hasDiagnostics ? (
                      <Chip tone="emerald">입력됨</Chip>
                    ) : (
                      <Chip tone="amber">미입력</Chip>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.status ? (
                      <Chip
                        tone={
                          r.status === "submitted"
                            ? "blue"
                            : r.status === "approved"
                              ? "emerald"
                              : r.status === "revision_requested"
                                ? "amber"
                                : "neutral"
                        }
                      >
                        {PLAN_STATUS_LABEL[r.status]}
                        {r.version && r.version > 1 ? ` v${r.version}` : ""}
                      </Chip>
                    ) : (
                      <Chip tone="outline">미작성</Chip>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.itemCount}</td>
                  <td className="text-muted-foreground px-2 py-2 tabular-nums">
                    {r.submittedAt ? r.submittedAt.slice(0, 10) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link
                      to={`${base}/plans/${r.profileId}`}
                      className="text-link inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                    >
                      <ClipboardCheckIcon className="size-3.5" /> 상담
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

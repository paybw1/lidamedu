// 비활성 학생 알림 cron (feat-7-023).
// 외부 cron (일별 또는 주2-3회) 호출. CRON_SECRET 보호.
// 각 활성 cohort 에서 N일+ 비활성 학생이 1명 이상이면 staff(owner) 인박스에 알림 1건.
// 이메일은 weekly-report 에 포함되어 별도 발송 안 함 — 중복 방지.

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { listCohortProgressSummary } from "~/features/admin/queries/student-progress.server";
import { createStaffNotifications } from "~/features/notifications/queries.server";

import type { Route } from "./+types/inactive-alert";

const DEFAULT_INACTIVE_DAYS = 7;

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

interface CohortProcessResult {
  cohortId: string;
  cohortName: string;
  inactiveCount: number;
  notified: boolean;
  reason?: string;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const inactiveDaysParam = Number(
    url.searchParams.get("inactiveDays") ?? DEFAULT_INACTIVE_DAYS,
  );
  const inactiveDays =
    Number.isFinite(inactiveDaysParam) && inactiveDaysParam > 0
      ? Math.min(60, Math.floor(inactiveDaysParam))
      : DEFAULT_INACTIVE_DAYS;
  const cutoffMs = inactiveDays * 86_400_000;
  const now = Date.now();

  const { data: cohorts, error } = await adminClient
    .from("cohorts")
    .select("cohort_id, name, owner_id, is_archived, deleted_at");
  if (error) return data({ error: error.message }, { status: 500 });
  const active = (cohorts ?? []).filter(
    (c) => !c.is_archived && c.deleted_at === null,
  );

  const processed: CohortProcessResult[] = [];
  for (const c of active) {
    const members = await listCohortProgressSummary(c.cohort_id);
    const inactive = members.filter(
      (m) =>
        !m.lastActivityAt ||
        now - new Date(m.lastActivityAt).getTime() > cutoffMs,
    );
    if (inactive.length === 0) {
      processed.push({
        cohortId: c.cohort_id,
        cohortName: c.name,
        inactiveCount: 0,
        notified: false,
        reason: "no inactive",
      });
      continue;
    }
    const topNames = inactive
      .slice(0, 3)
      .map((m) => m.name)
      .join(", ");
    const restCount = Math.max(0, inactive.length - 3);
    const body =
      inactive.length === 1
        ? `${topNames} 학생이 ${inactiveDays}일+ 미접속`
        : `${topNames}${restCount > 0 ? ` 외 ${restCount}명` : ""}이 ${inactiveDays}일+ 미접속 (총 ${inactive.length}명)`;

    await createStaffNotifications({
      recipientIds: [c.owner_id],
      kind: "cohort_inactive_alert",
      entityType: "cohort",
      entityId: c.cohort_id,
      title: `${c.name} — 비활성 학생 ${inactive.length}명`,
      body,
      href: `/admin/cohorts/${c.cohort_id}/progress`,
      payload: {
        inactiveDays,
        memberCount: members.length,
        inactiveCount: inactive.length,
      },
    });
    processed.push({
      cohortId: c.cohort_id,
      cohortName: c.name,
      inactiveCount: inactive.length,
      notified: true,
    });
  }

  return data({
    ok: true,
    summary: {
      activeCohorts: active.length,
      cohortsWithInactive: processed.filter((p) => p.notified).length,
      totalInactiveStudents: processed.reduce(
        (s, p) => s + p.inactiveCount,
        0,
      ),
    },
    processed,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}

// 종합반 등업 신청 관리 — 대기 신청을 반 배정으로 승인(=등업) 또는 반려. manager+.
import { useEffect, useState } from "react";
import { GraduationCapIcon, InboxIcon } from "lucide-react";
import { redirect, useFetcher } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  listUpgradeRequests,
  type UpgradeRequestRow,
} from "~/features/cohorts/upgrade-requests.server";

import type { Route } from "./+types/admin-cohort-requests";

export const meta: Route.MetaFunction = () => [
  { title: "등업 신청 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) throw redirect("/admin");

  const [requests, cohortsRes] = await Promise.all([
    listUpgradeRequests(),
    adminClient
      .from("cohorts")
      .select("cohort_id, name")
      .eq("is_archived", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  return {
    requests,
    cohorts: (cohortsRes.data ?? []).map((c) => ({
      cohortId: c.cohort_id,
      name: c.name,
    })),
  };
}

const STATUS_LABEL: Record<UpgradeRequestRow["status"], string> = {
  pending: "대기",
  approved: "승인",
  rejected: "반려",
};

export default function AdminCohortRequests({
  loaderData,
}: Route.ComponentProps) {
  const { requests, cohorts } = loaderData;
  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  return (
    <AdminShell title="등업 신청" cluster="cohorts">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <GraduationCapIcon className="text-link size-5" /> 종합반 등업 신청
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            요금제의 "종합반 등업 신청"으로 접수된 목록입니다. 승인 시 선택한
            반에 배정되며(=등업), 학생에게 알림이 발송됩니다.
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-sm font-bold">
            대기 중 <span className="text-link">{pending.length}</span>건
          </h2>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-10 text-center">
              <InboxIcon className="text-muted-foreground mx-auto size-8" />
              <p className="text-muted-foreground mt-2 text-sm">
                대기 중인 신청이 없습니다.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <PendingRow key={r.requestId} r={r} cohorts={cohorts} />
              ))}
            </ul>
          )}
        </section>

        {processed.length > 0 ? (
          <section>
            <h2 className="mb-2 text-sm font-bold">처리 완료</h2>
            <ul className="space-y-1.5">
              {processed.map((r) => (
                <li
                  key={r.requestId}
                  className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <span className="font-semibold">
                    {r.userName ?? "(이름 없음)"}
                  </span>
                  <span className="text-muted-foreground">
                    회원번호 {r.memberNo ?? "-"}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      r.status === "approved"
                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : "border-rose-500/40 text-rose-700 dark:text-rose-300"
                    }
                  >
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.cohortName ? (
                    <span className="text-muted-foreground">→ {r.cohortName}</span>
                  ) : null}
                  {r.adminNote ? (
                    <span className="text-muted-foreground">— {r.adminNote}</span>
                  ) : null}
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {r.processedAt?.slice(0, 10)} · {r.processedByName ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}

function PendingRow({
  r,
  cohorts,
}: {
  r: UpgradeRequestRow;
  cohorts: { cohortId: string; name: string }[];
}) {
  const [cohortId, setCohortId] = useState(cohorts[0]?.cohortId ?? "");
  const [rejecting, setRejecting] = useState(false);
  const fetcher = useFetcher<{ error?: string }>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else toast.success("처리했습니다.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <li className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{r.userName ?? "(이름 없음)"}</span>
        <span className="text-muted-foreground text-xs">
          회원번호 {r.memberNo ?? "-"}
        </span>
        {r.phone ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {r.phone}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {r.createdAt.slice(0, 16).replace("T", " ")}
        </span>
      </div>
      {r.message ? (
        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          {r.message}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <select
          value={cohortId}
          onChange={(e) => setCohortId(e.target.value)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          {cohorts.map((c) => (
            <option key={c.cohortId} value={c.cohortId}>
              {c.name}
            </option>
          ))}
        </select>
        <fetcher.Form method="post" action="/api/admin/cohort-request">
          <input type="hidden" name="intent" value="approve" />
          <input type="hidden" name="requestId" value={r.requestId} />
          <input type="hidden" name="cohortId" value={cohortId} />
          <Button type="submit" size="sm" disabled={busy || !cohortId} className="h-8 text-xs">
            이 반으로 승인
          </Button>
        </fetcher.Form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => setRejecting((v) => !v)}
        >
          반려
        </Button>
      </div>
      {rejecting ? (
        <fetcher.Form
          method="post"
          action="/api/admin/cohort-request"
          className="mt-2 flex items-start gap-2"
        >
          <input type="hidden" name="intent" value="reject" />
          <input type="hidden" name="requestId" value={r.requestId} />
          <Textarea
            name="note"
            required
            minLength={2}
            maxLength={300}
            rows={2}
            placeholder="반려 사유 (학생 알림에 포함)"
            className="flex-1 text-xs"
          />
          <Button type="submit" size="sm" variant="destructive" disabled={busy} className="h-8 text-xs">
            반려 확정
          </Button>
        </fetcher.Form>
      ) : null}
    </li>
  );
}

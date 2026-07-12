// 관리자 관리 — 운영 업무별 알림 담당자 지정. admin 전용.
// 배정된 담당자에게만 인박스(및 해당 업무의 이메일·알림톡)가 발송되고,
// 배정 0명인 업무는 기존처럼 역할 전체에게 발송(폴백)된다.

import { useEffect } from "react";
import { CheckIcon, UserCogIcon } from "lucide-react";
import { data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { ROLE_LABEL } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { STAFF_DUTIES, type StaffDuty } from "~/features/admin/lib/duties";
import {
  listDutyAssignments,
  setDutyAssignees,
} from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-staff-duties";

export const meta: Route.MetaFunction = () => [
  { title: "관리자 관리 | 리담변리사학원" },
];

async function requireAdmin(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [duties, staffRes] = await Promise.all([
    listDutyAssignments(),
    adminClient
      .from("profiles")
      .select("profile_id, name, role")
      .in("role", ["admin", "manager", "instructor"])
      .order("role")
      .order("name"),
  ]);
  const staff = (staffRes.data ?? []).map((s) => ({
    profileId: s.profile_id,
    name: s.name ?? "(이름 없음)",
    role: s.role,
  }));
  return { duties, staff };
}

const actionSchema = z.object({
  duty: z.enum(STAFF_DUTIES),
  assignees: z.array(z.string().uuid()),
});

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const fd = await request.formData();
  const parsed = actionSchema.safeParse({
    duty: fd.get("duty"),
    assignees: fd.getAll("assignees").map(String),
  });
  if (!parsed.success) return data({ error: "잘못된 입력입니다." }, { status: 400 });
  await setDutyAssignees(parsed.data.duty, parsed.data.assignees, user.id);
  // 감사 — 알림/접근 권한 라우팅 변경은 거버넌스 이벤트.
  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "duty.assign",
    entityType: "staff_duty",
    entityId: parsed.data.duty,
    metadata: { assignees: parsed.data.assignees },
  });
  return data({ ok: true, duty: parsed.data.duty });
}

export default function AdminStaffDuties({ loaderData }: Route.ComponentProps) {
  const { duties, staff } = loaderData;
  return (
    <AdminShell
      cluster="students"
      role="admin"
      title="관리자 관리"
      desc="운영 업무별 알림 담당자와 화면 접근 권한을 지정합니다. 알림 업무는 담당자에게만 발송(미지정 시 역할 전체 발송)되고, 접근 권한은 지정된 스태프와 원장만 해당 화면을 열 수 있습니다."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {duties.map((d) => (
          <DutyCard key={d.duty} duty={d} staff={staff} />
        ))}
      </div>
    </AdminShell>
  );
}

interface StaffOption {
  profileId: string;
  name: string;
  role: string;
}

function DutyCard({
  duty,
  staff,
}: {
  duty: {
    duty: StaffDuty;
    label: string;
    desc: string;
    kind: "notify" | "access";
    assignedIds: string[];
  };
  staff: StaffOption[];
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success(`'${duty.label}' 담당자를 저장했습니다.`);
    } else if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card rounded-xl border p-4 shadow-sm"
    >
      <input type="hidden" name="duty" value={duty.duty} />
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCogIcon className="text-muted-foreground size-4" />
          <h3 className="text-sm font-bold">{duty.label}</h3>
        </div>
        {duty.assignedIds.length === 0 ? (
          <Chip tone="amber">
            {duty.kind === "access" ? "원장 전용" : "전체 발송 중"}
          </Chip>
        ) : (
          <Chip tone="blue">
            {duty.kind === "access" ? "접근" : "담당"} {duty.assignedIds.length}
            명
          </Chip>
        )}
      </div>
      <p className="text-muted-foreground mb-3 text-[12px]">{duty.desc}</p>
      <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        {staff.map((s) => (
          <label
            key={s.profileId}
            className="hover:bg-muted/40 flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px]"
          >
            <input
              type="checkbox"
              name="assignees"
              value={s.profileId}
              defaultChecked={duty.assignedIds.includes(s.profileId)}
              className="accent-primary size-3.5"
            />
            <span className="truncate font-medium">{s.name}</span>
            <span className="text-muted-foreground shrink-0 text-[11px]">
              {ROLE_LABEL[s.role as keyof typeof ROLE_LABEL] ?? s.role}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px]">
          {duty.kind === "access"
            ? "체크 0명으로 저장하면 원장만 접근할 수 있습니다."
            : "체크 0명으로 저장하면 전체 발송으로 돌아갑니다."}
        </p>
        <Button type="submit" size="sm" className="h-8" disabled={saving}>
          <CheckIcon className="size-3.5" /> 저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

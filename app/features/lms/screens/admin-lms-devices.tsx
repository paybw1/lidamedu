// feat-11-003 — 기기 관리 (설계 §3.7). manager+.
// 기기 교체 CS 최다(★★★★★) — 회원 검색 → 등록 기기 목록 → 강제 초기화(월 제한 무시).

import { useEffect } from "react";
import { MonitorSmartphoneIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { resetDevice } from "~/features/lms/devices.server";

import type { Route } from "./+types/admin-lms-devices";

export const meta: Route.MetaFunction = () => [
  { title: "기기 관리 | 리담변리사학원" },
];

async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_cs", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);

  let userIds: string[] | null = null;
  if (q) {
    const memberNo = Number(q);
    let pq = adminClient.from("profiles").select("profile_id").limit(50);
    pq = Number.isInteger(memberNo) && memberNo > 0
      ? pq.eq("member_no", memberNo)
      : pq.ilike("name", `%${q}%`);
    const { data: profs } = await pq;
    userIds = (profs ?? []).map((p) => p.profile_id);
  }

  let dq = adminClient
    .from("user_devices")
    .select(
      "device_id, user_id, kind, device_name, device_fingerprint, registered_at, last_seen_at, revoked_at, revoked_by, user:profiles!user_devices_user_id_fkey(name, member_no)",
    )
    .order("registered_at", { ascending: false })
    .limit(200);
  if (userIds) {
    if (userIds.length === 0) return { devices: [], q, role };
    dq = dq.in("user_id", userIds);
  }
  const { data: devices, error } = await dq;
  if (error) throw error;
  return {
    devices: (devices ?? []).map((d) => {
      const user = d.user as { name: string | null; member_no: number | null } | null;
      return {
        deviceId: d.device_id,
        userName: user?.name ?? "(이름 없음)",
        memberNo: user?.member_no ?? null,
        kind: d.kind,
        deviceName: d.device_name,
        fingerprint: d.device_fingerprint ? `${d.device_fingerprint.slice(0, 10)}…` : null,
        registeredAt: d.registered_at,
        lastSeenAt: d.last_seen_at,
        revokedAt: d.revoked_at,
        revokedBy: d.revoked_by,
      };
    }),
    q,
    role,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const deviceId = String(fd.get("deviceId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!deviceId || !reason) return data({ error: "사유를 입력해 주세요." }, { status: 400 });
  const { data: device } = await adminClient
    .from("user_devices")
    .select("user_id")
    .eq("device_id", deviceId)
    .maybeSingle();
  const result = await resetDevice({
    deviceId,
    actorId: user.id,
    actorIsStaff: true, // 관리자 강제 초기화 — 월 제한 무시
    reason,
  });
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  if (device) {
    const { recordCsAction } = await import("~/features/orders/cs.server");
    await recordCsAction({
      userId: device.user_id,
      actorId: user.id,
      kind: "device_reset",
      refTable: "device_reset_logs",
      refId: deviceId,
      note: reason,
    });
  }
  return data({ ok: true as const });
}

const KIND_LABEL: Record<string, string> = { pc: "PC", mobile: "모바일", tablet: "태블릿" };

export default function AdminLmsDevices({ loaderData }: Route.ComponentProps) {
  const { devices, q, role } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="기기 관리"
      desc="회원별 등록 기기와 강제 초기화를 처리합니다. 본인 셀프 초기화는 월 1회 제한, 관리자 초기화는 제한이 없습니다. [벤더] 기기 식별(fingerprint)은 DRM 플레이어 확정 후 채워집니다."
      headerRight={
        <Chip tone="solid">
          <MonitorSmartphoneIcon className="size-3" /> {devices.length}대
        </Chip>
      }
    >
      <Form method="get" className="mb-3 flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="이름 또는 회원번호 검색"
          className="border-input bg-background h-9 w-72 rounded-lg border px-3 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" className="h-9">검색</Button>
      </Form>

      {devices.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {q ? "검색 결과가 없습니다." : "등록된 기기가 없습니다. (재생 시 자동 등록 — [벤더] 연동 후 활성)"}
        </p>
      ) : (
        <IndexTable
          minWidth={760}
          headers={[
            { label: "회원" },
            { label: "종류", width: "5rem" },
            { label: "기기", width: "12rem" },
            { label: "등록일", align: "right", width: "7rem" },
            { label: "마지막 사용", align: "right", width: "7rem" },
            { label: "상태", width: "6rem" },
            { label: "", width: "6rem" },
          ]}
        >
          {devices.map((d) => (
            <DeviceRow key={d.deviceId} device={d} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function DeviceRow({
  device,
}: {
  device: {
    deviceId: string;
    userName: string;
    memberNo: number | null;
    kind: string;
    deviceName: string | null;
    fingerprint: string | null;
    registeredAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
    revokedBy: string | null;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    else if (fetcher.state === "idle" && fetcher.data?.ok) toast.success("기기를 초기화했습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const reset = () => {
    const reason = prompt("초기화 사유 (기기 교체 CS 등):");
    if (!reason?.trim()) return;
    const fd = new FormData();
    fd.set("deviceId", device.deviceId);
    fd.set("reason", reason.trim());
    fetcher.submit(fd, { method: "post" });
  };
  return (
    <TR>
      <TD>
        <span className="font-semibold">{device.userName}</span>
        {device.memberNo != null ? (
          <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">No.{device.memberNo}</span>
        ) : null}
      </TD>
      <TD soft>{KIND_LABEL[device.kind] ?? device.kind}</TD>
      <TD soft>
        {device.deviceName ?? "—"}
        {device.fingerprint ? (
          <span className="text-muted-foreground ml-1 font-mono text-[10px]">{device.fingerprint}</span>
        ) : null}
      </TD>
      <TD align="right" mono soft>{device.registeredAt.slice(0, 10)}</TD>
      <TD align="right" mono soft>{device.lastSeenAt.slice(0, 10)}</TD>
      <TD>
        {device.revokedAt ? (
          <Chip tone="neutral">해제({device.revokedBy === "self" ? "본인" : "관리자"})</Chip>
        ) : (
          <Chip tone="emerald">사용중</Chip>
        )}
      </TD>
      <TD align="right">
        {!device.revokedAt ? (
          <button
            type="button"
            onClick={reset}
            disabled={fetcher.state !== "idle"}
            className="border-border h-6 rounded-md border px-2 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          >
            강제 초기화
          </button>
        ) : null}
      </TD>
    </TR>
  );
}

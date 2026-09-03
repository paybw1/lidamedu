// feat-11-004 4c — 배송 관리: 상태·택배사·송장. 갱신 즉시 학생 마이페이지에 반영(RLS self-read).

import { useEffect } from "react";
import { TruckIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import {
  FREE_SHIPPING_THRESHOLD_KEY,
  getFreeShippingThresholdKrw,
  setAppSetting,
} from "~/core/lib/app-settings.server";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { Input } from "~/core/components/ui/input";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { orderItemLabel } from "~/features/orders/lib/order-item-label";

import type { Route } from "./+types/admin-shipments";

export const meta: Route.MetaFunction = () => [
  { title: "배송 관리 | 리담변리사학원" },
];

const STATUS_LABEL: Record<string, string> = {
  preparing: "준비중",
  shipped: "발송",
  delivered: "배송완료",
  returned: "반품",
};
const STATUS_TONE: Record<string, "amber" | "blue" | "emerald" | "coral"> = {
  preparing: "amber",
  shipped: "blue",
  delivered: "emerald",
  returned: "coral",
};

async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_orders_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireManager(request);
  const freeShippingThreshold = await getFreeShippingThresholdKrw(client);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  let q = adminClient
    .from("shipments")
    .select(
      "shipment_id, order_item_id, status, courier, tracking_no, created_at, item:order_items!shipments_order_item_id_fkey(quantity, title_snapshot, book:books!order_items_book_fk(title), order:orders!order_items_order_id_fkey(order_id, user:profiles!orders_user_id_fkey(name, member_no)))",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status in STATUS_LABEL) q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) throw error;
  return {
    role,
    status,
    freeShippingThreshold,
    rows: (rows ?? []).map((s) => {
      const item = s.item as {
        quantity: number;
        title_snapshot: string | null;
        book: { title: string } | null;
        order: {
          order_id: string;
          user: { name: string | null; member_no: number | null } | null;
        } | null;
      } | null;
      return {
        shipmentId: s.shipment_id,
        status: s.status,
        courier: s.courier,
        trackingNo: s.tracking_no,
        createdAt: s.created_at,
        bookTitle: orderItemLabel({
          itemType: "book",
          titleSnapshot: item?.title_snapshot,
          bookTitle: item?.book?.title,
        }),
        quantity: item?.quantity ?? 1,
        orderNo: item?.order?.order_id.slice(0, 8) ?? "",
        userName: item?.order?.user?.name ?? "(이름 없음)",
        memberNo: item?.order?.user?.member_no ?? null,
      };
    }),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireManager(request);
  const fd = await request.formData();

  if (fd.get("intent") === "set_free_shipping") {
    const raw = Math.trunc(Number(fd.get("threshold") ?? 0));
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const res = await setAppSetting(
      client,
      FREE_SHIPPING_THRESHOLD_KEY,
      value,
      user.id,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true as const });
  }

  const shipmentId = String(fd.get("shipmentId") ?? "");
  const status = String(fd.get("status") ?? "");
  const courier = String(fd.get("courier") ?? "").trim() || null;
  const trackingNo = String(fd.get("trackingNo") ?? "").trim() || null;
  if (!shipmentId || !(status in STATUS_LABEL)) return data({ error: "잘못된 요청" }, { status: 400 });
  const patch: Record<string, unknown> = { status, courier, tracking_no: trackingNo };
  if (status === "shipped") patch.shipped_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { error } = await adminClient.from("shipments").update(patch).eq("shipment_id", shipmentId);
  if (error) return data({ error: error.message }, { status: 400 });
  return data({ ok: true as const });
}

export default function AdminShipments({ loaderData }: Route.ComponentProps) {
  const { rows, status, role, freeShippingThreshold } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="배송 관리"
      desc="도서 주문 배송 상태·택배사·송장번호를 관리합니다. 저장 즉시 학생 마이페이지에 반영됩니다."
      headerRight={
        <Chip tone="solid">
          <TruckIcon className="size-3" /> {rows.length}건
        </Chip>
      }
    >
      <FreeShippingSetting threshold={freeShippingThreshold} />
      <Form method="get" className="mb-3 flex items-center gap-2">
        <select name="status" defaultValue={status} className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-9">필터</Button>
      </Form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          배송 건이 없습니다.
        </p>
      ) : (
        <IndexTable
          minWidth={900}
          headers={[
            { label: "주문", width: "6rem" },
            { label: "회원" },
            { label: "도서" },
            { label: "상태", width: "6rem" },
            { label: "택배사·송장", width: "20rem" },
            { label: "생성", align: "right", width: "6.5rem" },
          ]}
        >
          {rows.map((r) => (
            <ShipmentRow key={r.shipmentId} row={r} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function FreeShippingSetting({ threshold }: { threshold: number }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) toast.success("무료배송 기준을 저장했습니다.");
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-muted/20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
    >
      <input type="hidden" name="intent" value="set_free_shipping" />
      <span className="font-semibold">도서 무료배송 기준</span>
      <span className="text-muted-foreground text-xs">
        도서 결제금액 합이 이 금액 이상이면 배송비 면제 (0 = 미적용)
      </span>
      <Input
        name="threshold"
        type="number"
        min={0}
        step={1000}
        defaultValue={threshold}
        className="h-8 w-32"
      />
      <span className="text-muted-foreground text-xs">원</span>
      <Button type="submit" size="sm" variant="outline" className="h-8" disabled={fetcher.state !== "idle"}>
        저장
      </Button>
      {threshold > 0 ? (
        <Chip tone="emerald">
          현재 {threshold.toLocaleString("ko-KR")}원 이상 무료배송
        </Chip>
      ) : (
        <Chip tone="outline">미적용</Chip>
      )}
    </fetcher.Form>
  );
}

function ShipmentRow({
  row,
}: {
  row: {
    shipmentId: string;
    status: string;
    courier: string | null;
    trackingNo: string | null;
    createdAt: string;
    bookTitle: string;
    quantity: number;
    orderNo: string;
    userName: string;
    memberNo: number | null;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    else if (fetcher.state === "idle" && fetcher.data?.ok) toast.success("배송 정보를 저장했습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <TR>
      <TD mono soft>{row.orderNo}</TD>
      <TD>
        <span className="font-semibold">{row.userName}</span>
        {row.memberNo != null ? (
          <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">No.{row.memberNo}</span>
        ) : null}
      </TD>
      <TD soft>
        {row.bookTitle}
        {row.quantity > 1 ? ` ×${row.quantity}` : ""}
      </TD>
      <TD>
        <Chip tone={STATUS_TONE[row.status] ?? "amber"}>{STATUS_LABEL[row.status] ?? row.status}</Chip>
      </TD>
      <TD>
        <fetcher.Form method="post" className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="shipmentId" value={row.shipmentId} />
          <select name="status" defaultValue={row.status} className="border-input bg-background h-7 rounded-md border px-1.5 text-[12px]">
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input name="courier" defaultValue={row.courier ?? ""} placeholder="택배사"
            className="border-input bg-background h-7 w-20 rounded-md border px-1.5 text-[12px]" />
          <input name="trackingNo" defaultValue={row.trackingNo ?? ""} placeholder="송장번호"
            className="border-input bg-background h-7 w-32 rounded-md border px-1.5 font-mono text-[12px]" />
          <Button type="submit" size="sm" variant="outline" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </fetcher.Form>
      </TD>
      <TD align="right" mono soft>{row.createdAt.slice(0, 10)}</TD>
    </TR>
  );
}

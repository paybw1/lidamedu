// feat-11-004 4a — 주문 관리: 목록·항목별 부분 환불(토스 부분취소 + 지급물 회수). manager+.

import { useEffect } from "react";
import { ReceiptTextIcon } from "lucide-react";
import { Form, data, useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  confirmBankTransfer,
  expireOverdueBankTransfers,
} from "~/features/orders/bank-transfer.server";
import { refundOrderItem } from "~/features/orders/orders.server";

import type { Route } from "./+types/admin-orders";

export const meta: Route.MetaFunction = () => [
  { title: "주문 관리 | 리담변리사학원" },
];

const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "장바구니",
  pending_payment: "결제 대기",
  pending_deposit: "입금 대기",
  paid: "결제 완료",
  partially_refunded: "부분 환불",
  refunded: "환불",
  cancelled: "취소",
  failed: "실패",
};
const ORDER_STATUS_TONE: Record<string, "emerald" | "amber" | "coral" | "neutral" | "violet"> = {
  paid: "emerald",
  pending_payment: "amber",
  pending_deposit: "amber",
  partially_refunded: "violet",
  refunded: "coral",
  cancelled: "neutral",
  failed: "neutral",
  draft: "neutral",
};

async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  return { user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const status = url.searchParams.get("status") ?? "";

  // 4b — 기한 초과 무통장 lazy 만료(cron 이중 안전망).
  await expireOverdueBankTransfers();

  // 입금 대기 무통장 목록
  const { data: pendingTransfers } = await adminClient
    .from("bank_transfers")
    .select(
      "transfer_id, order_id, depositor_name, expected_amount_krw, expires_at, order:orders!bank_transfers_order_id_fkey(status, user_id, user:profiles!orders_user_id_fkey(name, member_no))",
    )
    .is("deposited_at", null)
    .order("created_at", { ascending: true });
  const transfers = (pendingTransfers ?? [])
    .filter((t) => (t.order as { status: string } | null)?.status === "pending_deposit")
    .map((t) => {
      const order = t.order as {
        status: string;
        user: { name: string | null; member_no: number | null } | null;
      } | null;
      return {
        transferId: t.transfer_id,
        orderNo: t.order_id.slice(0, 8),
        depositorName: t.depositor_name,
        expectedKrw: t.expected_amount_krw,
        expiresAt: t.expires_at,
        userName: order?.user?.name ?? "(이름 없음)",
        memberNo: order?.user?.member_no ?? null,
      };
    });

  let oq = adminClient
    .from("orders")
    .select(
      "order_id, user_id, status, total_krw, payment_method, created_at, user:profiles!orders_user_id_fkey(name, member_no)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status in ORDER_STATUS_LABEL) oq = oq.eq("status", status);
  const { data: orders, error } = await oq;
  if (error) throw error;

  const orderIds = (orders ?? []).map((o) => o.order_id);
  const itemsByOrder = new Map<string, Array<{
    orderItemId: string;
    label: string;
    itemType: string;
    quantity: number;
    unitPriceKrw: number;
    refundedAt: string | null;
  }>>();
  for (let i = 0; i < orderIds.length; i += 100) {
    const { data: items } = await adminClient
      .from("order_items")
      .select(
        "order_item_id, order_id, item_type, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name)",
      )
      .in("order_id", orderIds.slice(i, i + 100));
    for (const it of items ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push({
        orderItemId: it.order_item_id,
        label:
          (it.plan as { name: string } | null)?.name ??
          (it.item_type === "book" ? "(도서)" : "(항목)"),
        itemType: it.item_type,
        quantity: it.quantity,
        unitPriceKrw: it.unit_price_krw,
        refundedAt: it.refunded_at,
      });
      itemsByOrder.set(it.order_id, arr);
    }
  }

  let rows = (orders ?? []).map((o) => {
    const user = o.user as { name: string | null; member_no: number | null } | null;
    return {
      orderId: o.order_id,
      orderNo: o.order_id.slice(0, 8),
      userName: user?.name ?? "(이름 없음)",
      memberNo: user?.member_no ?? null,
      status: o.status,
      totalKrw: o.total_krw,
      paymentMethod: o.payment_method,
      createdAt: o.created_at,
      items: itemsByOrder.get(o.order_id) ?? [],
    };
  });
  if (q) {
    rows = rows.filter(
      (r) =>
        r.userName.includes(q) ||
        String(r.memberNo ?? "").includes(q) ||
        r.orderId.startsWith(q.toLowerCase()) ||
        r.items.some((i) => i.label.includes(q)),
    );
  }
  return { rows, transfers, q, status, role };
}

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireManager(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "confirm_transfer") {
    const transferId = String(fd.get("transferId") ?? "");
    const memo = String(fd.get("memo") ?? "").trim() || null;
    if (!transferId) return data({ error: "잘못된 요청" }, { status: 400 });
    const result = await confirmBankTransfer({ transferId, actorId: user.id, memo });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true as const, confirmed: true });
  }

  const orderItemId = String(fd.get("orderItemId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!orderItemId || !reason) return data({ error: "환불 사유를 입력해 주세요." }, { status: 400 });
  const result = await refundOrderItem({ orderItemId, reason, actorId: user.id });
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  return data({ ok: true as const, refundedKrw: result.refundedKrw });
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { rows, transfers, q, status, role } = loaderData;
  return (
    <AdminShell
      cluster="sales"
      role={role}
      title="주문 관리"
      desc="강의·도서 주문과 항목 단위 부분 환불을 처리합니다. 환불 시 해당 항목의 수강권은 자동 회수됩니다. (플랜 단건 결제도 이제 1-item 주문으로 기록됩니다.)"
      headerRight={
        <Chip tone="solid">
          <ReceiptTextIcon className="size-3" /> {rows.length}건
        </Chip>
      }
    >
      {/* 4b — 무통장 입금 대기 (수동 승인) */}
      {transfers.length > 0 ? (
        <section className="border-amber-500/40 bg-amber-500/5 mb-4 rounded-xl border p-3">
          <h3 className="mb-2 text-[13px] font-bold">
            무통장 입금 대기 {transfers.length}건 — 입금 확인 시 즉시 지급됩니다
          </h3>
          <ul className="space-y-1.5">
            {transfers.map((t) => (
              <BankTransferRow key={t.transferId} transfer={t} />
            ))}
          </ul>
        </section>
      ) : null}

      <Form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="이름 / 회원번호 / 주문번호(앞 8자) / 상품명"
          className="border-input bg-background h-9 w-80 rounded-lg border px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
        >
          <option value="">전체 상태</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-9">검색</Button>
      </Form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          주문이 없습니다.
        </p>
      ) : (
        <IndexTable
          minWidth={900}
          headers={[
            { label: "주문번호", width: "6.5rem" },
            { label: "회원" },
            { label: "항목" },
            { label: "결제수단", width: "6rem" },
            { label: "금액", align: "right", width: "7rem" },
            { label: "상태", width: "6rem" },
            { label: "일시", align: "right", width: "7rem" },
          ]}
        >
          {rows.map((r) => (
            <OrderRow key={r.orderId} row={r} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function BankTransferRow({
  transfer,
}: {
  transfer: {
    transferId: string;
    orderNo: string;
    depositorName: string;
    expectedKrw: number;
    expiresAt: string;
    userName: string;
    memberNo: number | null;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) toast.success("입금 확인 — 주문을 지급 처리했습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const confirmDeposit = () => {
    if (
      !confirm(
        `입금자 '${transfer.depositorName}' — ₩${transfer.expectedKrw.toLocaleString("ko-KR")} 입금을 확인했습니까? 확인 즉시 수강권이 지급됩니다.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "confirm_transfer");
    fd.set("transferId", transfer.transferId);
    fetcher.submit(fd, { method: "post" });
  };
  return (
    <li className="bg-card border-border/60 flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px]">
      <span className="font-mono text-muted-foreground">{transfer.orderNo}</span>
      <span className="font-semibold">{transfer.userName}</span>
      {transfer.memberNo != null ? (
        <span className="text-muted-foreground tabular-nums">No.{transfer.memberNo}</span>
      ) : null}
      <span>
        입금자명 <strong>{transfer.depositorName}</strong>
      </span>
      <span className="tabular-nums">₩{transfer.expectedKrw.toLocaleString("ko-KR")}</span>
      <span className="text-muted-foreground tabular-nums">
        기한 {new Date(transfer.expiresAt).toLocaleString("ko-KR")}
      </span>
      <Button
        type="button"
        size="sm"
        className="ml-auto h-7 text-[12px]"
        onClick={confirmDeposit}
        disabled={fetcher.state !== "idle"}
      >
        입금 확인 → 지급
      </Button>
    </li>
  );
}

const METHOD_LABEL: Record<string, string> = {
  toss: "토스",
  bank_transfer: "무통장",
  free: "무료",
  manual: "수동",
};

function OrderRow({
  row,
}: {
  row: {
    orderId: string;
    orderNo: string;
    userName: string;
    memberNo: number | null;
    status: string;
    totalKrw: number;
    paymentMethod: string;
    createdAt: string;
    items: Array<{
      orderItemId: string;
      label: string;
      itemType: string;
      quantity: number;
      unitPriceKrw: number;
      refundedAt: string | null;
    }>;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; refundedKrw?: number }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      toast.success(`항목을 환불했습니다 (₩${(fetcher.data.refundedKrw ?? 0).toLocaleString("ko-KR")}). 지급물은 자동 회수됩니다.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const refundItem = (orderItemId: string, label: string) => {
    const reason = prompt(`'${label}' 항목 환불 사유:`);
    if (!reason?.trim()) return;
    if (!confirm(`'${label}' 항목을 환불할까요? 토스 결제는 부분취소가 실행되고 수강권이 회수됩니다.`)) return;
    const fd = new FormData();
    fd.set("orderItemId", orderItemId);
    fd.set("reason", reason.trim());
    fetcher.submit(fd, { method: "post" });
  };
  const refundable = ["paid", "partially_refunded"].includes(row.status);
  return (
    <TR>
      <TD mono soft>
        <span title={row.orderId}>{row.orderNo}</span>
      </TD>
      <TD>
        <span className="font-semibold">{row.userName}</span>
        {row.memberNo != null ? (
          <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">No.{row.memberNo}</span>
        ) : null}
      </TD>
      <TD>
        <div className="flex flex-col gap-0.5">
          {row.items.map((it) => (
            <div key={it.orderItemId} className="flex items-center gap-1.5 text-[12px]">
              <span className={it.refundedAt ? "text-muted-foreground line-through" : ""}>
                {it.label}
                {it.quantity > 1 ? ` ×${it.quantity}` : ""}
              </span>
              {it.refundedAt ? (
                <Chip tone="coral">환불됨</Chip>
              ) : refundable ? (
                <button
                  type="button"
                  onClick={() => refundItem(it.orderItemId, it.label)}
                  disabled={fetcher.state !== "idle"}
                  className="border-border h-5 rounded border px-1.5 text-[10px] font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                >
                  항목 환불
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </TD>
      <TD soft>{METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}</TD>
      <TD align="right" mono>₩{row.totalKrw.toLocaleString("ko-KR")}</TD>
      <TD>
        <Chip tone={ORDER_STATUS_TONE[row.status] ?? "neutral"}>
          {ORDER_STATUS_LABEL[row.status] ?? row.status}
        </Chip>
      </TD>
      <TD align="right" mono soft>
        <span title={row.createdAt}>{row.createdAt.slice(0, 10)}</span>
      </TD>
    </TR>
  );
}

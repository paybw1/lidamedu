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
import {
  Chip,
  IndexTable,
  MemberLink,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  confirmBankTransfer,
  expireOverdueBankTransfers,
} from "~/features/orders/bank-transfer.server";
import { expireStaleCheckoutOrders, refundOrderItem } from "~/features/orders/orders.server";
import {
  listPendingRefundRequests,
  resolveRefundRequest,
} from "~/features/orders/refund-requests.server";

import type { Route } from "./+types/admin-orders";
import { orderItemLabel } from "~/features/orders/lib/order-item-label";

export const meta: Route.MetaFunction = () => [
  { title: "주문 관리 | 리담변리사학원" },
];

const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "장바구니",
  attempted: "결제시도",
  pending_payment: "결제 대기",
  pending_deposit: "입금 대기",
  paid: "결제 완료",
  partially_refunded: "부분 환불",
  refunded: "환불",
  cancelled: "취소",
  failed: "실패",
  expired: "만료",
};

// feat-11-011 P1 — 결제창을 열기만 하고 끝내지 않은 건. 기본 목록에서 빼고
// 별도 탭으로 본다(요청서 §3.2 "일반 주문·매출 집계와 분리").
// ★상태 필터로 직접 고르면 그때는 보여 준다 — 감추는 게 아니라 섞지 않는 것이다.
const CHECKOUT_ATTEMPT_STATUSES = ["draft", "attempted", "pending_payment", "expired"];
const ORDER_STATUS_TONE: Record<string, "emerald" | "amber" | "coral" | "neutral" | "violet"> = {
  paid: "emerald",
  pending_payment: "amber",
  pending_deposit: "amber",
  partially_refunded: "violet",
  refunded: "coral",
  cancelled: "neutral",
  failed: "neutral",
  draft: "neutral",
  attempted: "neutral",
  expired: "neutral",
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
  return { user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const status = url.searchParams.get("status") ?? "";
  const itemType = url.searchParams.get("itemType") ?? ""; // "" | "course" | "book"

  // 4b — 기한 초과 무통장 lazy 만료(cron 이중 안전망).
  await expireOverdueBankTransfers();
  // feat-11-011 P1 — 끝내지 않은 결제시도 만료. 목록을 열 때마다 정리된다.
  await expireStaleCheckoutOrders();

  // 4d — 매출 요약(파생 뷰 v_sales_daily, 저장 아님). KST 오늘·이번 달.
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const monthStartKst = todayKst.slice(0, 8) + "01";
  const { data: sales } = await adminClient
    .from("v_sales_daily")
    .select("sale_date, orders_count, gross_krw, refund_krw")
    .gte("sale_date", monthStartKst);
  let todayGross = 0;
  let monthGross = 0;
  let monthRefund = 0;
  for (const s of sales ?? []) {
    monthGross += Number(s.gross_krw ?? 0);
    monthRefund += Number(s.refund_krw ?? 0);
    if (s.sale_date === todayKst) todayGross = Number(s.gross_krw ?? 0);
  }

  // P3 — 대기 환불 요청(사용자 개시)
  const refundRequests = await listPendingRefundRequests();

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
  if (status && status in ORDER_STATUS_LABEL) {
    oq = oq.eq("status", status);
  } else {
    // 기본 목록 = 실제 주문만. 결제시도·만료·장바구니는 섞지 않는다.
    oq = oq.not("status", "in", `(${CHECKOUT_ATTEMPT_STATUSES.join(",")})`);
  }
  const { data: orders, error } = await oq;
  if (error) throw error;

  // 결제시도 현황 — 목록에서 뺀 대신 건수는 보여 준다(있는 줄도 모르면 안 된다).
  const { count: attemptCount } = await adminClient
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .in("status", ["attempted", "pending_payment"]);

  const orderIds = (orders ?? []).map((o) => o.order_id);
  const itemsByOrder = new Map<string, Array<{
    orderItemId: string;
    label: string;
    itemType: string;
    quantity: number;
    unitPriceKrw: number;
    refundedAt: string | null;
    /** 연장 항목 한 줄 요약 — 기존 종료일 → 새 종료일 · N일 · N회차. */
    extensionNote: string | null;
  }>>();
  for (let i = 0; i < orderIds.length; i += 100) {
    const { data: items } = await adminClient
      .from("order_items")
      .select(
        "order_item_id, order_id, item_type, title_snapshot, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title)",
      )
      .in("order_id", orderIds.slice(i, i + 100));
    for (const it of items ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push({
        orderItemId: it.order_item_id,
        label: orderItemLabel({
          itemType: it.item_type,
          titleSnapshot: it.title_snapshot,
          planName: (it.plan as { name: string } | null)?.name,
          bookTitle: (it.book as { title: string } | null)?.title,
        }),
        itemType: it.item_type,
        quantity: it.quantity,
        unitPriceKrw: it.unit_price_krw,
        refundedAt: it.refunded_at,
        extensionNote: null,
      });
      itemsByOrder.set(it.order_id, arr);
    }
  }

  // feat-11-011 P2 — 연장 주문의 기존 종료일·연장일수·회차·새 종료일.
  // ★새 컬럼을 만들지 않는다. enrollment_extensions 에 이미 다 있고(feat-11-010),
  //   두 곳에 저장하면 환불로 되돌릴 때 어긋난다. 여기서 조인해 보여 주기만 한다.
  {
    const extItemIds = [...itemsByOrder.values()]
      .flat()
      .filter((it) => it.itemType === "course_extension")
      .map((it) => it.orderItemId);
    if (extItemIds.length) {
      const { data: exts } = await adminClient
        .from("enrollment_extensions")
        .select("order_item_id, enrollment_id, days_added, prev_expires_at, next_expires_at, status")
        .in("order_item_id", extItemIds);
      // 연장 회차 = 그 수강권에 적용된 건수(카운터를 따로 두지 않는다 — feat-11-010).
      const enrollmentIds = [...new Set((exts ?? []).map((e) => e.enrollment_id))];
      const countByEnrollment = new Map<string, number>();
      if (enrollmentIds.length) {
        const { data: applied } = await adminClient
          .from("enrollment_extensions")
          .select("enrollment_id")
          .in("enrollment_id", enrollmentIds)
          .eq("status", "applied");
        for (const a of applied ?? []) {
          countByEnrollment.set(a.enrollment_id, (countByEnrollment.get(a.enrollment_id) ?? 0) + 1);
        }
      }
      const d = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
      const noteBy = new Map<string, string>();
      for (const e of exts ?? []) {
        if (!e.order_item_id) continue;
        const nth = countByEnrollment.get(e.enrollment_id) ?? 0;
        noteBy.set(
          e.order_item_id,
          `${d(e.prev_expires_at)} → ${d(e.next_expires_at)} · ${e.days_added}일` +
            (nth ? ` · 누적 ${nth}회` : "") +
            (e.status === "reverted" ? " · 환불로 되돌림" : ""),
        );
      }
      for (const arr of itemsByOrder.values()) {
        for (const it of arr) {
          if (it.itemType === "course_extension") {
            it.extensionNote = noteBy.get(it.orderItemId) ?? "결제 전 — 아직 적용되지 않음";
          }
        }
      }
    }
  }

  let rows = (orders ?? []).map((o) => {
    const user = o.user as { name: string | null; member_no: number | null } | null;
    return {
      orderId: o.order_id,
      orderNo: o.order_id.slice(0, 8),
      userId: o.user_id,
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
  // P4 — 항목유형 필터: 교재 포함만 / 강의 포함만.
  if (itemType === "book") {
    rows = rows.filter((r) => r.items.some((i) => i.itemType === "book"));
  } else if (itemType === "course") {
    rows = rows.filter((r) => r.items.some((i) => i.itemType !== "book"));
  }
  return {
    rows,
    transfers,
    refundRequests,
    q,
    status,
    itemType,
    role,
    attemptCount: attemptCount ?? 0,
    sales: { todayGross, monthGross, monthRefund },
  };
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

  if (intent === "resolve_refund") {
    const refundRequestId = String(fd.get("refundRequestId") ?? "");
    const approve = fd.get("approve") === "1";
    const note = String(fd.get("note") ?? "").trim();
    if (!refundRequestId) return data({ error: "잘못된 요청" }, { status: 400 });
    const result = await resolveRefundRequest({
      refundRequestId,
      approve,
      actorId: user.id,
      note,
    });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({
      ok: true as const,
      resolved: approve ? "approved" : "rejected",
      refundedKrw: result.refundedKrw,
    });
  }

  const orderItemId = String(fd.get("orderItemId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!orderItemId || !reason) return data({ error: "환불 사유를 입력해 주세요." }, { status: 400 });
  const result = await refundOrderItem({ orderItemId, reason, actorId: user.id });
  if (!result.ok) return data({ error: result.error }, { status: 400 });
  return data({ ok: true as const, refundedKrw: result.refundedKrw });
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { rows, transfers, refundRequests, q, status, itemType, role, sales, attemptCount } =
    loaderData;
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
      {/* 4d — 매출 요약(파생) */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[
          { label: "오늘 매출", value: sales.todayGross },
          { label: "이번 달 매출", value: sales.monthGross },
          { label: "이번 달 환불", value: sales.monthRefund },
        ].map((c) => (
          <div key={c.label} className="border-border bg-card rounded-xl border p-3 shadow-sm">
            <p className="text-muted-foreground text-[11px] font-semibold">{c.label}</p>
            <p className="text-[18px] font-extrabold tabular-nums">
              ₩{c.value.toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </div>

      {/* P3 — 사용자 환불 요청 대기 (승인 시 부분취소·회수 실행) */}
      {refundRequests.length > 0 ? (
        <section className="border-rose-500/40 bg-rose-500/5 mb-4 rounded-xl border p-3">
          <h3 className="mb-2 text-[13px] font-bold">
            환불 요청 대기 {refundRequests.length}건 — 승인 시 토스 부분취소 + 수강권 회수가 실행됩니다
          </h3>
          <ul className="space-y-1.5">
            {refundRequests.map((r) => (
              <RefundRequestRow key={r.refundRequestId} req={r} />
            ))}
          </ul>
        </section>
      ) : null}

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

      {attemptCount > 0 && !status ? (
        <p className="border-border bg-muted/40 text-muted-foreground mb-3 rounded-lg border px-3 py-2 text-xs">
          결제창만 열고 끝내지 않은 <strong className="text-foreground">결제시도 {attemptCount}건</strong>은
          목록에서 빼 두었습니다. 30분이 지나면 자동으로 만료 처리됩니다.{" "}
          <a href="?status=attempted" className="text-link underline">
            결제시도만 보기
          </a>
        </p>
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
        <select
          name="itemType"
          defaultValue={itemType}
          className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
        >
          <option value="">전체 항목</option>
          <option value="course">강의 포함</option>
          <option value="book">교재 포함</option>
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

function RefundRequestRow({
  req,
}: {
  req: {
    refundRequestId: string;
    orderNo: string;
    userName: string | null;
    memberNo: number | null;
    itemLabel: string;
    itemAmountKrw: number;
    alreadyRefunded: boolean;
    reason: string;
    createdAt: string;
  };
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; resolved?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      toast.success(
        fetcher.data.resolved === "approved"
          ? "환불을 승인했습니다 — 부분취소·회수가 실행되었습니다."
          : "환불 요청을 반려했습니다.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const approve = () => {
    if (req.alreadyRefunded) {
      toast.error("이미 환불된 항목입니다.");
      return;
    }
    const note = prompt(
      `'${req.itemLabel}' (₩${req.itemAmountKrw.toLocaleString("ko-KR")}) 환불을 승인합니다.\n메모(선택):`,
      "",
    );
    if (note === null) return;
    if (!confirm("승인하면 토스 부분취소와 수강권 회수가 즉시 실행됩니다. 진행할까요?")) return;
    const fd = new FormData();
    fd.set("intent", "resolve_refund");
    fd.set("refundRequestId", req.refundRequestId);
    fd.set("approve", "1");
    fd.set("note", note.trim());
    fetcher.submit(fd, { method: "post" });
  };
  const reject = () => {
    const note = prompt(`환불 요청 반려 사유(학생에게 참고용으로 기록됩니다):`);
    if (!note?.trim()) return;
    const fd = new FormData();
    fd.set("intent", "resolve_refund");
    fd.set("refundRequestId", req.refundRequestId);
    fd.set("approve", "0");
    fd.set("note", note.trim());
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <li className="bg-card border-border/60 flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px]">
      <span className="font-mono text-muted-foreground">{req.orderNo}</span>
      <span className="font-semibold">{req.userName ?? "(이름 없음)"}</span>
      {req.memberNo != null ? (
        <span className="text-muted-foreground tabular-nums">No.{req.memberNo}</span>
      ) : null}
      <span>{req.itemLabel}</span>
      <span className="tabular-nums">₩{req.itemAmountKrw.toLocaleString("ko-KR")}</span>
      <span className="text-muted-foreground max-w-[16rem] truncate" title={req.reason}>
        사유: {req.reason}
      </span>
      {req.alreadyRefunded ? (
        <Chip tone="coral">이미 환불됨</Chip>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-7 text-[12px]"
          onClick={approve}
          disabled={fetcher.state !== "idle" || req.alreadyRefunded}
        >
          승인 → 환불
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={reject}
          disabled={fetcher.state !== "idle"}
        >
          반려
        </Button>
      </div>
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
    userId: string | null;
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
      extensionNote: string | null;
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
        <MemberLink
          profileId={row.userId}
          name={row.userName}
          className="font-semibold"
        />
        {row.memberNo != null ? (
          <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">No.{row.memberNo}</span>
        ) : null}
      </TD>
      <TD>
        <div className="flex flex-col gap-0.5">
          {row.items.map((it) => (
            <div key={it.orderItemId} className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className={it.refundedAt ? "text-muted-foreground line-through" : ""}>
                {it.label}
                {it.quantity > 1 ? ` ×${it.quantity}` : ""}
              </span>
              {it.extensionNote ? (
                <span className="text-muted-foreground basis-full text-[10.5px] tabular-nums">
                  {it.extensionNote}
                </span>
              ) : null}
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

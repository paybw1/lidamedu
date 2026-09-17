// feat-11-004 4a — 주문 관리: 목록·무통장 입금 확인. manager+ (직무 lms_orders_admin).
// feat-11-014 Q2 — 상태 변경 셀렉트(사유 필수 · 이력 원장 order_status_logs) + 보관함.
//   Q3 — 레거시 학생 환불요청 경로(resolve_refund)·행 안의 「항목 환불」(refundOrderItem)은 제거.
//   환불은 환불관리로 접수하고(「환불신청」 링크), 전액 장부 정리는 셀렉트 「환불완료」(원장).

import { Fragment, useEffect } from "react";
import { ReceiptTextIcon } from "lucide-react";
import { Form, Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

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
import { expireOverdueBankTransfers } from "~/features/orders/bank-transfer.server";
import {
  EVIDENCE_MAX_LENGTH,
  OrderStatusSelect,
  REASON_MAX_LENGTH,
  SET_STATUS_INTENT,
  isShortcutRefundMethod,
} from "~/features/orders/components/order-status-select";
import {
  ADMIN_ONLY_ORDER_ACTIONS,
  ADMIN_ORDER_ACTIONS,
  ADMIN_ORDER_STATUS_LABEL,
  ADMIN_ORDER_STATUS_TONE,
  HIDDEN_FROM_STUDENT_FILTER,
  MIN_ORDER_STATUS_REASON_LENGTH,
  ORDER_STATUSES,
  adminOrderStatusLabel,
  orderStatusLogLabel,
  type OrderStatus,
} from "~/features/orders/lib/order-status";
import {
  type OrderStatusLogRow,
  applyAdminOrderAction,
  listOrderStatusLogs,
} from "~/features/orders/order-status-admin.server";
import { expireStaleCheckoutOrders } from "~/features/orders/orders.server";
import {
  REFUND_METHODS,
  REFUND_STATUSES,
  isMoneyMovedStatus,
  remainingRefundableKrw,
} from "~/features/refunds/lib/refund-status";

import type { Route } from "./+types/admin-orders";
import { orderItemLabel } from "~/features/orders/lib/order-item-label";

export const meta: Route.MetaFunction = () => [
  { title: "주문 관리 | 리담변리사학원" },
];

/** 목록 상한 · PostgREST `.in()` 배치 크기. */
const ORDER_LIST_LIMIT = 200;
const IN_BATCH_SIZE = 100;
/** 표 열 수 — 이력 행의 colSpan. */
const COLUMN_COUNT = 7;
/** 입금 대기 목록의 「입금 확인」 버튼은 메모가 없을 수 있다 — 이력 사유의 기본값. */
const TRANSFER_CONFIRM_DEFAULT_REASON = "무통장 입금 대기 목록에서 입금 확인";
/** 돈이 실제로 나간 환불 상태 — refund-status.ts 의 MONEY_MOVED 판정을 그대로 쓴다. */
const MONEY_MOVED_REFUND_STATUSES = REFUND_STATUSES.filter(isMoneyMovedStatus);
async function requireManager(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_orders_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { user, role };
}

function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireManager(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const statusParam = url.searchParams.get("status") ?? "";
  const status = isOrderStatus(statusParam) ? statusParam : "";
  const itemType = url.searchParams.get("itemType") ?? ""; // "" | "course" | "book"
  // feat-11-014 A2 — 「보관함」: archived_at 이 선 주문만. 기본 목록은 보관되지 않은 주문만.
  const archived = url.searchParams.get("archived") === "1";

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
      "order_id, user_id, status, total_krw, payment_method, archived_at, created_at, user:profiles!orders_user_id_fkey(name, member_no)",
    )
    .order("created_at", { ascending: false })
    .limit(ORDER_LIST_LIMIT);
  oq = archived ? oq.not("archived_at", "is", null) : oq.is("archived_at", null);
  if (status) {
    oq = oq.eq("status", status);
  } else if (!archived) {
    // 기본 목록 = 실제 주문만. 결제시도·만료·장바구니는 섞지 않는다(feat-11-011 P1,
    // 요청서 §3.2 "일반 주문·매출 집계와 분리"). ★상태 필터로 직접 고르면 그때는 보여 준다.
    // 감추는 집합은 학생 목록에서 감추는 집합(HIDDEN_FROM_STUDENT)과 같은 값이라 그것을 쓴다.
    // ★보관함에서는 이 제외를 걸지 않는다 — 보관 가능한 상태가 거의 다 이 집합에 겹친다.
    oq = oq.not("status", "in", HIDDEN_FROM_STUDENT_FILTER);
  }
  const { data: orders, error } = await oq;
  if (error) throw error;

  // 결제시도 현황 — 목록에서 뺀 대신 건수는 보여 준다(있는 줄도 모르면 안 된다).
  const { count: attemptCount } = await adminClient
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .in("status", ["attempted", "pending_payment"])
    .is("archived_at", null);

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
  // feat-11-014 — 환불완료(장부 정리)의 실환급액 기본값 = total − 완료된 환불 합.
  //   환불관리 접수 스냅샷(getOrderForRefund.priorRefundedKrw)과 같은 평면으로 센다.
  const priorRefundedByOrder = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += IN_BATCH_SIZE) {
    const chunk = orderIds.slice(i, i + IN_BATCH_SIZE);
    const [{ data: items }, { data: doneRefunds }] = await Promise.all([
      adminClient
        .from("order_items")
        .select(
          "order_item_id, order_id, item_type, title_snapshot, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title)",
        )
        .in("order_id", chunk),
      adminClient
        .from("refunds")
        .select("order_id, this_refund_krw")
        .in("order_id", chunk)
        .in("status", MONEY_MOVED_REFUND_STATUSES),
    ]);
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
    for (const r of doneRefunds ?? []) {
      priorRefundedByOrder.set(
        r.order_id,
        (priorRefundedByOrder.get(r.order_id) ?? 0) + (r.this_refund_krw ?? 0),
      );
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

  // feat-11-014 — 「항목 환불」(refundOrderItem)로 환불된 상품은 refunds 에 행이 없다(payments·
  //   order_items 만 갱신). 그런 상품이 있는 주문은 위의 잔액 계산이 그 환불분을 못 빼고, 서버의
  //   환불완료 단축도 같은 평면이라 합계 검증에 반드시 걸린다 → 행에 건수를 실어 옵션을 감춘다.
  //   판정 = refunded_at 이 섰는데 refund_items 연결이 없는 상품(환불 도메인 커밋은 연결을 남긴다).
  const legacyItemRefundCountByOrder = new Map<string, number>();
  {
    const refundedItems = [...itemsByOrder.entries()].flatMap(
      ([orderId, arr]) =>
        arr
          .filter((it) => it.refundedAt)
          .map((it) => ({ orderId, orderItemId: it.orderItemId })),
    );
    const linked = new Set<string>();
    for (let i = 0; i < refundedItems.length; i += IN_BATCH_SIZE) {
      const chunk = refundedItems
        .slice(i, i + IN_BATCH_SIZE)
        .map((it) => it.orderItemId);
      const { data: refundItems } = await adminClient
        .from("refund_items")
        .select("order_item_id")
        .in("order_item_id", chunk);
      for (const ri of refundItems ?? []) linked.add(ri.order_item_id);
    }
    for (const it of refundedItems) {
      if (linked.has(it.orderItemId)) continue;
      legacyItemRefundCountByOrder.set(
        it.orderId,
        (legacyItemRefundCountByOrder.get(it.orderId) ?? 0) + 1,
      );
    }
  }

  // feat-11-014 D2 — 상태 변경 이력(order_status_logs). 행 아래 펼침으로 보인다.
  // ★목록 상한(200)을 한 번의 `.in()` 에 싣지 않는다 — 위 조회와 같은 배치 크기로 나눠 합친다.
  //   한 주문의 이력은 같은 배치에 들어가므로 배치별 created_at desc 정렬이 그대로 보존된다.
  const logsByOrder = new Map<string, OrderStatusLogRow[]>();
  for (let i = 0; i < orderIds.length; i += IN_BATCH_SIZE) {
    const part = await listOrderStatusLogs(
      orderIds.slice(i, i + IN_BATCH_SIZE),
    );
    for (const [orderId, logs] of part) logsByOrder.set(orderId, logs);
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
      archivedAt: o.archived_at,
      createdAt: o.created_at,
      remainingRefundableKrw: remainingRefundableKrw({
        originalPaidKrw: o.total_krw,
        priorRefundedKrw: priorRefundedByOrder.get(o.order_id) ?? 0,
      }),
      legacyItemRefundCount: legacyItemRefundCountByOrder.get(o.order_id) ?? 0,
      items: itemsByOrder.get(o.order_id) ?? [],
      logs: logsByOrder.get(o.order_id) ?? [],
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
    q,
    status,
    itemType,
    archived,
    role,
    attemptCount: attemptCount ?? 0,
    sales: { todayGross, monthGross, monthRefund },
  };
}

// feat-11-014 D2 — 셀렉트 확인 다이얼로그가 보내는 입력. 사유 필수(min 2),
//   환불완료일 때만 실환급액·처리 근거·환불 방법을 요구한다.
//   ★메시지는 전부 한국어로 채운다 — 화면 가드를 우회한 요청도 zod 영문 기본 문구가 토스트로 나가면 안 된다.
const setStatusSchema = z
  .object({
    orderId: z.string().uuid("잘못된 주문입니다."),
    action: z.enum(ADMIN_ORDER_ACTIONS, { message: "잘못된 처리 종류입니다." }),
    reason: z
      .string({ message: "사유를 입력해 주세요." })
      .trim()
      .min(
        MIN_ORDER_STATUS_REASON_LENGTH,
        `사유를 ${MIN_ORDER_STATUS_REASON_LENGTH}자 이상 입력해 주세요.`,
      )
      .max(REASON_MAX_LENGTH, `사유는 ${REASON_MAX_LENGTH}자 이내로 입력해 주세요.`),
    refundKrw: z.coerce
      .number({ message: "실환급액은 숫자여야 합니다." })
      .int("실환급액은 정수여야 합니다.")
      .min(1, "실환급액은 1원 이상이어야 합니다.")
      .optional(),
    evidenceNo: z
      .string({ message: "처리 근거(송금번호 등)를 입력해 주세요." })
      .trim()
      .max(
        EVIDENCE_MAX_LENGTH,
        `처리 근거는 ${EVIDENCE_MAX_LENGTH}자 이내로 입력해 주세요.`,
      )
      .optional(),
    // 환불 방법은 환불 도메인 SSOT 값 중 PG 취소가 없는 부분집합만 — 판정은 컴포넌트의 타입가드 한 곳.
    method: z
      .enum(REFUND_METHODS, { message: "잘못된 환불 방법입니다." })
      .refine(
        isShortcutRefundMethod,
        "이 처리에서는 원결제수단 취소를 고를 수 없습니다.",
      )
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action !== "refund_complete") return;
    if (v.refundKrw == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refundKrw"], message: "실환급액을 입력해 주세요." });
    }
    if (!v.evidenceNo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceNo"], message: "처리 근거(송금번호 등)를 입력해 주세요." });
    }
    if (!v.method) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["method"], message: "환불 방법을 골라 주세요." });
    }
  });

export async function action({ request }: Route.ActionArgs) {
  const { user, role } = await requireManager(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === SET_STATUS_INTENT) {
    const parsed = setStatusSchema.safeParse({
      orderId: fd.get("orderId"),
      action: fd.get("action"),
      reason: fd.get("reason"),
      refundKrw: fd.get("refundKrw") ?? undefined,
      evidenceNo: fd.get("evidenceNo") ?? undefined,
      method: fd.get("method") ?? undefined,
    });
    if (!parsed.success) {
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
        { status: 400 },
      );
    }
    const v = parsed.data;
    // ★원장 전용 액션(환불완료)은 라우트 경계에서도 한 번 더 막는다 — 환불 확정 게이트와 동일.
    if (ADMIN_ONLY_ORDER_ACTIONS.includes(v.action) && role !== "admin") {
      return data({ error: "환불완료 처리는 원장만 할 수 있습니다." }, { status: 403 });
    }
    const refund =
      v.action === "refund_complete" && v.refundKrw != null && v.evidenceNo && v.method
        ? { refundKrw: v.refundKrw, evidenceNo: v.evidenceNo, method: v.method }
        : undefined;
    const result = await applyAdminOrderAction({
      orderId: v.orderId,
      action: v.action,
      reason: v.reason,
      actorId: user.id,
      actorRole: role,
      refund,
    });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true as const, detail: result.detail });
  }

  if (intent === "confirm_transfer") {
    const transferId = String(fd.get("transferId") ?? "");
    const memo = String(fd.get("memo") ?? "").trim() || null;
    if (!transferId) return data({ error: "잘못된 요청" }, { status: 400 });
    // feat-11-014 — 입금 대기 목록의 버튼도 상태 액션 경로로 돌려 이력이 남게 한다
    //   (내부에서 confirmBankTransfer → markOrderPaidAndFulfill). transferId → orderId 만 여기서 푼다.
    const { data: transfer } = await adminClient
      .from("bank_transfers")
      .select("order_id")
      .eq("transfer_id", transferId)
      .maybeSingle();
    if (!transfer) return data({ error: "무통장 신청을 찾을 수 없습니다." }, { status: 400 });
    const result = await applyAdminOrderAction({
      orderId: transfer.order_id,
      action: "confirm_deposit",
      reason: memo ?? TRANSFER_CONFIRM_DEFAULT_REASON,
      actorId: user.id,
      actorRole: role,
    });
    if (!result.ok) return data({ error: result.error }, { status: 400 });
    return data({ ok: true as const, confirmed: true });
  }

  // feat-11-014 Q3 — 「항목 환불」(refundOrderItem) 경로는 이 화면에서 뺀다. 토스 주문은 D9 로 이미
  //   거부됐고, 무통장·수동 주문은 payments 행이 없어 「연결된 결제를 찾을 수 없습니다」로 막혀
  //   실제로 쓸 수 있는 주문이 없었다. 전액 장부 정리는 상태 셀렉트 「환불완료」, 부분은 환불관리.
  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { rows, transfers, q, status, itemType, archived, role, sales, attemptCount } =
    loaderData;
  return (
    <AdminShell
      cluster="sales"
      role={role}
      title="주문 관리"
      desc="강의·도서 주문을 관리합니다. 상태 열의 셀렉트로 입금대기(재접수)·결제완료(무통장)·취소·환불완료(원장)·보관을 사유와 함께 처리하고, 환불은 「환불신청」으로 환불관리에 접수합니다. 무통장·수동 주문의 항목 환불은 여기서 바로 처리되며 수강권은 자동 회수됩니다."
      headerRight={
        <Chip tone="solid">
          <ReceiptTextIcon className="size-3" /> {archived ? "보관 " : ""}{rows.length}건
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

      {attemptCount > 0 && !status && !archived ? (
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
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{ADMIN_ORDER_STATUS_LABEL[s]}</option>
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
        {/* feat-11-014 A2 — 보관함. URL(?archived=1)이 SSOT. */}
        <label className="text-muted-foreground flex h-9 cursor-pointer items-center gap-1.5 text-xs font-medium">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} />
          보관함
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-9">검색</Button>
      </Form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {archived ? "보관된 주문이 없습니다." : "주문이 없습니다."}
        </p>
      ) : (
        <IndexTable
          minWidth={960}
          headers={[
            { label: "주문번호", width: "6.5rem" },
            { label: "회원" },
            { label: "항목" },
            { label: "결제수단", width: "6rem" },
            { label: "금액", align: "right", width: "7rem" },
            { label: "상태", width: "10rem" },
            { label: "일시", align: "right", width: "7rem" },
          ]}
        >
          {rows.map((r) => (
            <OrderRow key={r.orderId} row={r} role={role} />
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

/** 로더가 만든 행 모양을 그대로 쓴다 — 손으로 옮겨 적으면 필드가 어긋난다. */
type OrderRowData = Route.ComponentProps["loaderData"]["rows"][number];

function OrderRow({ row, role }: { row: OrderRowData; role: string }) {
  // feat-11-014 Q3 — 행 안의 「항목 환불」 버튼(refundOrderItem)은 뺐다. 토스 주문은 D9 로 거부됐고
  //   무통장·수동은 payments 행이 없어 실행되지 않던 경로다. 전액 장부 정리는 상태 셀렉트
  //   「환불완료」(원장), 부분·항목 환불은 「환불신청」(환불관리 접수)으로 간다.
  const refundable = ["paid", "partially_refunded"].includes(row.status);
  return (
    <Fragment>
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
                {it.refundedAt ? <Chip tone="coral">환불됨</Chip> : null}
              </div>
            ))}
          </div>
        </TD>
        <TD soft>{METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}</TD>
        <TD align="right" mono>₩{row.totalKrw.toLocaleString("ko-KR")}</TD>
        <TD>
          <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <Chip tone={isOrderStatus(row.status) ? ADMIN_ORDER_STATUS_TONE[row.status] : "neutral"}>
                {adminOrderStatusLabel(row.status)}
              </Chip>
              {row.archivedAt ? <Chip tone="neutral">보관됨</Chip> : null}
            </div>
            {/* feat-11-014 Q2 — 상태 변경 셀렉트(허용 전이만 · 사유 필수 · 이력). */}
            <OrderStatusSelect order={row} role={role} />
            {/* feat-11-013 P6 — 환불관리 접수. ★여기서는 돈이 움직이지 않는다(요청서 §2). */}
            {refundable ? (
              <Link
                to={`/admin/refunds/new?orderId=${row.orderId}`}
                className="border-border text-link h-5 rounded border px-1.5 text-[10px] font-medium hover:underline"
              >
                환불신청
              </Link>
            ) : null}
          </div>
        </TD>
        <TD align="right" mono soft>
          <span title={row.createdAt}>{row.createdAt.slice(0, 10)}</span>
        </TD>
      </TR>
      {/* feat-11-014 D2 — 변경 이력(변경일시 · 처리관리자 · 전→후 · 사유). 0건이면 행을 만들지 않는다. */}
      {row.logs.length > 0 ? (
        <TR>
          <TD colSpan={COLUMN_COUNT} className="py-1.5">
            <details className="text-[12px]">
              <summary className="text-muted-foreground cursor-pointer text-[11px] font-semibold select-none">
                변경 이력 {row.logs.length}건
              </summary>
              <ul className="mt-1.5 space-y-1">
                {row.logs.map((l) => (
                  <li key={l.logId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground font-mono tabular-nums">
                      {new Date(l.createdAt).toLocaleString("ko-KR")}
                    </span>
                    <span className="font-semibold">{l.actorName ?? "(관리자 미상)"}</span>
                    <span>
                      {orderStatusLogLabel(l.fromStatus)} → {orderStatusLogLabel(l.toStatus)}
                    </span>
                    <span className="text-muted-foreground">{l.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          </TD>
        </TR>
      ) : null}
    </Fragment>
  );
}

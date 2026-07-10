// feat-8-029 P3 — 사용자 개시 환불요청 워크플로.
// 학생: 결제 완료 항목에 환불 요청(RLS client, 소유권 서버 검증).
// 운영자: 대기 요청 목록 + 승인(refundOrderItem 실행)/거절 (adminClient — service_role).

import type { SupabaseClient } from "@supabase/supabase-js";

import adminClient from "~/core/lib/supa-admin-client.server";
import type { Database } from "database.types";

import { refundOrderItem } from "./orders.server";

export type RefundRequestStatus = "pending" | "approved" | "rejected";

export interface AdminRefundRequestRow {
  refundRequestId: string;
  orderItemId: string;
  orderId: string;
  orderNo: string;
  userId: string;
  userName: string | null;
  memberNo: number | null;
  itemLabel: string;
  itemAmountKrw: number;
  alreadyRefunded: boolean;
  orderStatus: string;
  reason: string;
  createdAt: string;
}

/**
 * 학생 환불 요청 생성. 소유권·환불 가능 여부를 요청 클라이언트(RLS)로 검증.
 * 항목당 대기중 요청 하나만(부분 유니크 인덱스) — 중복은 사용자 친화 메시지로 반환.
 */
export async function createRefundRequest(
  client: SupabaseClient<Database>,
  input: { userId: string; orderItemId: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < 2) return { ok: false, error: "환불 사유를 입력해 주세요." };

  // 소유권 + 환불 가능 여부 (RLS self-read).
  const { data: item } = await client
    .from("order_items")
    .select("order_item_id, refunded_at, order:orders!order_items_order_id_fkey(user_id, status)")
    .eq("order_item_id", input.orderItemId)
    .maybeSingle();
  const order = item?.order as { user_id: string; status: string } | null;
  if (!item || !order || order.user_id !== input.userId) {
    return { ok: false, error: "주문 항목을 찾을 수 없습니다." };
  }
  if (item.refunded_at) return { ok: false, error: "이미 환불된 항목입니다." };
  if (!["paid", "partially_refunded"].includes(order.status)) {
    return { ok: false, error: "결제 완료 상태의 주문만 환불 요청할 수 있습니다." };
  }

  const { error } = await client.from("refund_requests").insert({
    order_item_id: input.orderItemId,
    user_id: input.userId,
    reason,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 접수된 환불 요청이 처리 대기중입니다." };
    }
    return { ok: false, error: "환불 요청 접수에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

/** 내 주문 항목의 환불요청 상태 맵(orderItemId → status). my-orders 표시용. */
export async function getMyRefundRequestMap(
  client: SupabaseClient<Database>,
  userId: string,
  orderItemIds: string[],
): Promise<Map<string, RefundRequestStatus>> {
  const map = new Map<string, RefundRequestStatus>();
  if (orderItemIds.length === 0) return map;
  const { data } = await client
    .from("refund_requests")
    .select("order_item_id, status, created_at")
    .eq("user_id", userId)
    .in("order_item_id", orderItemIds)
    .order("created_at", { ascending: false });
  // 최신 요청 상태만 유지(내림차순 정렬 → 먼저 본 것이 최신).
  for (const r of data ?? []) {
    if (!map.has(r.order_item_id)) {
      map.set(r.order_item_id, r.status as RefundRequestStatus);
    }
  }
  return map;
}

/** 운영자 대기 환불요청 목록(오래된 순). adminClient. */
export async function listPendingRefundRequests(): Promise<AdminRefundRequestRow[]> {
  const { data, error } = await adminClient
    .from("refund_requests")
    .select(
      "refund_request_id, order_item_id, user_id, reason, created_at, " +
        "user:profiles!refund_requests_user_id_fkey(name, member_no), " +
        "item:order_items!refund_requests_order_item_id_fkey(" +
        "order_id, item_type, quantity, unit_price_krw, refunded_at, " +
        "plan:subscription_plans!order_items_plan_id_fkey(name), " +
        "book:books!order_items_book_fk(title), " +
        "order:orders!order_items_order_id_fkey(status))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;

  // 3단계 임베드 — PostgREST 타입 추론이 GenericStringError 로 실패해 명시 캐스팅.
  const rows = (data ?? []) as unknown as Array<{
    refund_request_id: string;
    order_item_id: string;
    user_id: string;
    reason: string;
    created_at: string;
    user: { name: string | null; member_no: number | null } | null;
    item: {
      order_id: string;
      item_type: string;
      quantity: number;
      unit_price_krw: number;
      refunded_at: string | null;
      plan: { name: string } | null;
      book: { title: string } | null;
      order: { status: string } | null;
    } | null;
  }>;

  return rows.map((r) => {
    const user = r.user;
    const item = r.item;
    const label =
      item?.plan?.name ??
      item?.book?.title ??
      (item?.item_type === "book" ? "(도서)" : "(항목)");
    return {
      refundRequestId: r.refund_request_id,
      orderItemId: r.order_item_id,
      orderId: item?.order_id ?? "",
      orderNo: (item?.order_id ?? "").slice(0, 8),
      userId: r.user_id,
      userName: user?.name ?? null,
      memberNo: user?.member_no ?? null,
      itemLabel: label,
      itemAmountKrw: (item?.unit_price_krw ?? 0) * (item?.quantity ?? 1),
      alreadyRefunded: item?.refunded_at != null,
      orderStatus: item?.order?.status ?? "",
      reason: r.reason,
      createdAt: r.created_at,
    };
  });
}

/**
 * 운영자 환불요청 처리. 승인 시 refundOrderItem(토스 부분취소·회수·CS 미러) 실행 후 승인 기록,
 * 실패하면 요청은 pending 유지(재시도 가능). 거절 시 사유와 함께 rejected.
 */
export async function resolveRefundRequest(input: {
  refundRequestId: string;
  approve: boolean;
  actorId: string;
  note: string;
}): Promise<{ ok: true; refundedKrw?: number } | { ok: false; error: string }> {
  const { data: req } = await adminClient
    .from("refund_requests")
    .select("refund_request_id, order_item_id, user_id, reason, status")
    .eq("refund_request_id", input.refundRequestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "환불 요청을 찾을 수 없습니다." };
  if (req.status !== "pending") {
    return { ok: false, error: "이미 처리된 요청입니다." };
  }

  if (input.approve) {
    const reason = input.note.trim() || req.reason;
    const result = await refundOrderItem({
      orderItemId: req.order_item_id,
      reason: `환불요청 승인: ${reason}`,
      actorId: input.actorId,
    });
    if (!result.ok) return { ok: false, error: result.error };
    await adminClient
      .from("refund_requests")
      .update({
        status: "approved",
        resolved_by: input.actorId,
        resolved_at: new Date().toISOString(),
        resolve_note: input.note.trim() || null,
        refunded_krw: result.refundedKrw,
      })
      .eq("refund_request_id", input.refundRequestId);
    return { ok: true, refundedKrw: result.refundedKrw };
  }

  const note = input.note.trim();
  if (!note) return { ok: false, error: "거절 사유를 입력해 주세요." };
  await adminClient
    .from("refund_requests")
    .update({
      status: "rejected",
      resolved_by: input.actorId,
      resolved_at: new Date().toISOString(),
      resolve_note: note,
    })
    .eq("refund_request_id", input.refundRequestId);
  return { ok: true };
}

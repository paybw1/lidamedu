// feat-11-013 P6-b — 환불 확정 커밋의 서버 진입점.
//
// ★순서가 설계다 — **지급물 회수 먼저, 돈 커밋 나중.**
//   두 쓰기를 한 트랜잭션에 묶을 수 없다(수강권 회수는 TS 에, 돈은 RPC 에 있다).
//   그래서 어느 쪽이 먼저 죽어도 덜 나쁜 순서를 고른다.
//
//     회수 먼저 → 커밋 실패:  수강권은 회수됐는데 환불 기록이 없다.
//                             관리자가 다시 누르면 닫힌다(회수는 멱등). **돈은 틀리지 않는다.**
//     커밋 먼저 → 회수 실패:  환불 완료인데 수강권이 살아 있다.
//                             아무도 모르고, 조용히 학원 손해로 남는다.
//
// ★`commit_refund` 는 service_role 전용이다 — 수강권·포인트·쿠폰·주문상태를 한 번에
//   움직이므로 authenticated 에 열면 강사 계정이 PostgREST 로 직접 환불을 확정할 수 있다
//   (`private.is_staff` 에는 instructor 가 포함된다). 그래서 adminClient 로만 부른다.
//   행위자는 auth.uid() 가 아니라 **인자로 넘긴다** — service_role 세션엔 uid 가 없다.

import adminClient from "~/core/lib/supa-admin-client.server";

import { revokeFulfillmentForRefund } from "~/features/orders/orders.server";

export type CommitRefundResult =
  | {
      ok: true;
      idempotent: boolean;
      status: string;
      pointReturnedKrw: number;
      pointRevokedKrw: number;
      pointRevokeShortfallKrw: number;
      couponRestored: number;
    }
  | { ok: false; error: string };

/**
 * 환불 확정 — 요청서 §9 후속처리 + §10 일괄처리.
 *
 * @param actorId 처리한 관리자. 상태 이력의 「누가」가 된다.
 */
export async function commitRefund(input: {
  refundId: string;
  actorId: string;
  memo?: string | null;
}): Promise<CommitRefundResult> {
  // ① 지급물 회수 — 수강권·연장 일수·재고·배송. 전부 멱등이라 재시도해도 안전하다.
  const revoke = await revokeFulfillmentForRefund(input.refundId);
  if (!revoke.ok) return { ok: false, error: revoke.error };

  // ② 돈과 원장 — 한 번에.
  const { data, error } = await adminClient.rpc("commit_refund", {
    p_refund_id: input.refundId,
    p_actor_id: input.actorId,
    p_memo: input.memo ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  const r = data as {
    ok?: boolean;
    error?: string;
    idempotent?: boolean;
    status?: string;
    pointReturned?: number;
    pointRevoked?: number;
    pointRevokeShortfall?: number;
    couponRestored?: number;
  } | null;
  if (!r?.ok) return { ok: false, error: r?.error ?? "환불 확정에 실패했습니다." };

  return {
    ok: true,
    idempotent: r.idempotent === true,
    status: r.status ?? "",
    pointReturnedKrw: r.pointReturned ?? 0,
    pointRevokedKrw: r.pointRevoked ?? 0,
    pointRevokeShortfallKrw: r.pointRevokeShortfall ?? 0,
    couponRestored: r.couponRestored ?? 0,
  };
}

/**
 * ★토스 웹훅이 **열린 환불건에 취소결과를 옮겨 적고 소유권을 넘긴다** (feat-11-013 P6-b).
 *
 * 요청서 §5 의 운영은 「관리자가 토스 상점관리자에서 직접 취소」다. 그러면 관리자가 리담으로
 * 돌아오기 **전에 웹훅이 먼저 도착한다.** 종전 웹훅은 그 자리에서 `markOrderRefundedAndRevoke`
 * 로 항목 환불 기록과 수강권 회수까지 끝내 버렸다 — 확정 커밋이 할 일을 **다른 행위자가
 * 절반 해 놓은 상태**로 만든다. 확정 RPC 의 가드가 우연히 견뎌 내지만, 그 사이 같은 주문에
 * 두 번째 환불건이 열리면 **아직 접수도 안 된 항목이 이미 환불됨으로 찍혀 있다.**
 *
 * 그래서 열린 환불건이 있으면 웹훅은 **비켜선다.** 대신 §6 이 요구하는 네 값 중 셋
 * (취소금액·취소일시·거래번호)을 자동으로 채운다 — 관리자는 처리담당자만 확인하면 된다.
 *
 * @returns taken=true 면 웹훅은 회수·항목기록을 **하지 않는다.**
 */
export async function takeOverPgCancelIfOpenRefund(input: {
  orderId: string;
  cancelKrw: number | null;
  cancelledAt: string | null;
  transactionNo: string | null;
  kind: "full" | "partial";
}): Promise<{ taken: boolean; refundId?: string }> {
  const { data: open } = await adminClient
    .from("refunds")
    .select("refund_id, status, this_refund_krw")
    .eq("order_id", input.orderId)
    .is("closed_at", null)
    .order("created_at", { ascending: false });
  if (!open?.length) return { taken: false };

  // PG 취소대기 건이 곧 「내가 지금 토스에서 취소한다」고 선언한 건이다. 없으면 가장 최근 건.
  const target = open.find((r) => r.status === "pg_pending") ?? open[0];

  await adminClient
    .from("refunds")
    .update({
      pg_cancel_krw: input.cancelKrw,
      pg_cancelled_at: input.cancelledAt ?? new Date().toISOString(),
      pg_transaction_no: input.transactionNo,
      pg_cancel_kind: input.kind,
      // ★확정액은 **비어 있을 때만** 채운다. 관리자가 5,000 으로 확정했는데 토스에서
      //   4,000 만 취소된 경우를 덮어쓰면, 어긋남을 잡으라고 만든 가드가 그대로 통과한다.
      ...(target.this_refund_krw == null ? { this_refund_krw: input.cancelKrw } : {}),
    })
    .eq("refund_id", target.refund_id);

  if (target.status === "pg_pending") {
    await setRefundStatus({
      refundId: target.refund_id,
      status: "pg_done",
      actorId: null,
      memo: "토스 취소 웹훅 수신 — 취소정보 자동 입력",
    });
  }
  return { taken: true, refundId: target.refund_id };
}

/**
 * 환불건을 다른 상태로 옮긴다 — 이력의 「누가·메모」가 함께 남도록 GUC 를 세운다.
 *
 * ★상태 전이의 **적법성 판정은 `lib/refund-status.ts`** 가 한다(호출부가 먼저 부른다).
 *   여기서 다시 판정하지 않는다 — 두 곳에 같은 표를 두면 반드시 어긋난다.
 *   DB 는 상태 문자열과 금액 상한만 백스톱으로 막는다.
 */
export async function setRefundStatus(input: {
  refundId: string;
  status: string;
  /** ★null 은 「사람이 아닌 호출」이다 — 웹훅·스윕. 이력에 행위자 없이 남는다. */
  actorId: string | null;
  memo?: string | null;
  /**
   * ★종결된 건을 되돌린다. 원장 권한 + 수정사유를 호출부가 먼저 확인한 경우에만 true.
   * 기본 false 인 이유는 **토스 웹훅이 재전송되기 때문**이다 — 이미 환불완료된 건에
   * 재전송이 들어오면 상태가 PG 취소완료로 되돌아가 같은 주문항목이 다시 환불 가능해진다.
   */
  allowReopen?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await adminClient.rpc("set_refund_status", {
    p_refund_id: input.refundId,
    p_status: input.status,
    p_actor_id: input.actorId ?? undefined,
    p_memo: input.memo ?? undefined,
    p_allow_reopen: input.allowReopen ?? false,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) return { ok: false, error: r?.error ?? "상태를 바꾸지 못했습니다." };
  return { ok: true };
}

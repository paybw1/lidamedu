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
 * 환불건을 다른 상태로 옮긴다 — 이력의 「누가·메모」가 함께 남도록 GUC 를 세운다.
 *
 * ★상태 전이의 **적법성 판정은 `lib/refund-status.ts`** 가 한다(호출부가 먼저 부른다).
 *   여기서 다시 판정하지 않는다 — 두 곳에 같은 표를 두면 반드시 어긋난다.
 *   DB 는 상태 문자열과 금액 상한만 백스톱으로 막는다.
 */
export async function setRefundStatus(input: {
  refundId: string;
  status: string;
  actorId: string;
  memo?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient.rpc("set_refund_status", {
    p_refund_id: input.refundId,
    p_status: input.status,
    p_actor_id: input.actorId,
    p_memo: input.memo ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

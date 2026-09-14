// 주문에 걸린 포인트를 되돌리는 서버 유틸 (feat-11-013 D15).
//
// ★예약 해제와 환불 반환은 **다른 연산**이다.
//     예약해제 = 결제가 죽어서 **안 쓴 것을 무르는** 일 → 주문 단위·전액·1회
//     환불반환 = 이미 **쓴 것을 돌려주는** 일         → 항목 단위·부분·반복
//   원장(point_transactions)의 멱등 축도 그래서 (kind, ref_type, ref_id) 로 갈라 두었다.
//
// ★★둘 다 **adminClient 로만** 부른다. RPC 가 service_role 전용이고(웹훅·스윕은 사용자
//   세션이 없어 auth.uid() 가 null 이다), 요청 클라이언트로 부르면 권한 오류로 **조용히**
//   죽는다. 반대로 예약(spend_points_for_order)은 auth.uid() 기반이라 요청 클라이언트 전용이다.
//
// ★멱등은 DB 가 지킨다 — 결제창 닫기·웹훅·30분 스윕이 같은 주문에 겹쳐 들어오고
//   웹훅은 재전송된다. 애플리케이션 카운트로 막지 않는다.

import adminClient from "~/core/lib/supa-admin-client.server";

/**
 * 결제가 성립하지 않은 주문의 포인트 예약을 푼다.
 *
 * ★RPC 안에 `orders.status in (cancelled, expired, failed)` 가드가 있다 — 결제창 닫기
 *   신호와 승인 응답이 엇갈려 도착해도 **결제된 주문에는 걸리지 않는다.** 호출부가
 *   상태를 잘못 판단해도 원장이 먼저 막는다.
 */
export async function releasePointsForOrders(
  orderIds: string[],
  reason?: string,
): Promise<number> {
  let released = 0;
  for (const orderId of orderIds) {
    try {
      const { data, error } = await adminClient.rpc("release_points_for_order", {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) {
        console.error("[points] 예약 해제 실패", orderId, error.message);
        continue;
      }
      const amount = (data as { released?: number } | null)?.released ?? 0;
      if (amount > 0) released += amount;
    } catch (e) {
      // 반환이 실패해도 호출부(주문 취소·만료)를 막지 않는다 — 자가치유가 뒤늦게 줍는다.
      console.error("[points] 예약 해제 예외", orderId, e);
    }
  }
  return released;
}

/**
 * 환불된 주문 **항목**의 포인트를 돌려준다.
 *
 * ★금액은 인자로 받지 않는다 — 권위는 `order_items.point_alloc_krw`(P1 스냅샷)이고
 *   RPC 가 그 칸을 읽는다. 호출부가 계산해 넘기면 두 곳이 서로 다른 금액을 말하게 된다.
 */
export async function refundPointsForOrderItem(
  orderItemId: string,
  reason?: string,
): Promise<number> {
  try {
    const { data, error } = await adminClient.rpc("refund_points_for_order_item", {
      p_order_item_id: orderItemId,
      p_reason: reason,
    });
    if (error) {
      console.error("[points] 환불 반환 실패", orderItemId, error.message);
      return 0;
    }
    return (data as { refunded?: number } | null)?.refunded ?? 0;
  } catch (e) {
    console.error("[points] 환불 반환 예외", orderItemId, e);
    return 0;
  }
}

/**
 * ★진짜 마지막 그물 — 상태를 보고 **뒤늦게 줍는다.**
 *
 * 전이 훅(결제창 닫기·웹훅·스윕)은 전부 「상태 전이」와 「포인트 반환」이 **트랜잭션이 아닌
 * 두 번의 쓰기**다. 스윕이 500건을 도는 중에 Vercel 함수가 죽으면 그 주문들은 이미 expired
 * 라 다음 스윕이 **다시 집지 않는다** — 포인트가 영구히 묶인다. 그래서 훅이 하나도 안
 * 불려도 이것이 줍는다.
 */
export async function releaseOrphanedPointReservations(limit = 200): Promise<{
  orders: number;
  points: number;
}> {
  try {
    const { data, error } = await adminClient.rpc("release_orphaned_point_reservations", {
      p_limit: limit,
    });
    if (error) {
      console.error("[points] 미반환 예약 회수 실패", error.message);
      return { orders: 0, points: 0 };
    }
    const r = data as { orders?: number; points?: number } | null;
    return { orders: r?.orders ?? 0, points: r?.points ?? 0 };
  } catch (e) {
    console.error("[points] 미반환 예약 회수 예외", e);
    return { orders: 0, points: 0 };
  }
}

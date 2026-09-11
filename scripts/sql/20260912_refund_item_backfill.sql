-- feat-8-031 — 전체 환불(markOrderRefundedAndRevoke)이 항목에 환불을 남기지 않던 구멍의 소급 보정.
-- 주문이 refunded 인데 항목에 refunded_at 이 없는 건을 항목 금액 그대로 환불 처리한다.
-- 환불 시각은 주문 갱신 시각(정확한 환불 시각 기록이 없어 이것이 최선 — 정산 월 귀속에 쓰인다).
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260912_refund_item_backfill.sql
update public.order_items i
   set refunded_at = o.updated_at,
       refund_amount_krw = i.unit_price_krw * i.quantity,
       refund_reason = coalesce(i.refund_reason, '전체 환불(소급 기록)')
  from public.orders o
 where o.order_id = i.order_id
   and o.status = 'refunded'
   and i.refunded_at is null;

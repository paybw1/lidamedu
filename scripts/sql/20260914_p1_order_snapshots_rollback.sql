-- 롤백 — feat-11-013 P1.
-- ★되돌리면 그 사이 쌓인 결제 스냅샷이 사라진다. 스냅샷은 재생성이 불가능하다
--   (결제 당시 값이고, 상품 정보는 그 뒤에 바뀌었을 수 있다). 신중히.
drop index if exists public.order_items_no_snapshot_idx;

alter table public.order_items
  drop constraint if exists order_items_refund_calc_type_check;

alter table public.order_items
  drop column if exists paid_amount_krw,
  drop column if exists list_price_snapshot_krw,
  drop column if exists duration_days_snapshot,
  drop column if exists planned_sessions_snapshot,
  drop column if exists coupon_alloc_krw,
  drop column if exists point_alloc_krw,
  drop column if exists refund_calc_type,
  drop column if exists refund_policy_snapshot;

alter table public.subscription_plans
  drop column if exists planned_sessions;

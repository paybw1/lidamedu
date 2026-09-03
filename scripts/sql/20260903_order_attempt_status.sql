-- feat-11-011 P1 — 결제 안정화.
--
-- PG 창을 띄우기 전에 만든 주문이 'pending_payment'(결제 대기)로 남아 정리되지 않았다.
-- 사용자가 결제창을 닫으면 그대로 쌓인다 — 운영 DB 에 24건이 7/8부터 남아 있었다.
--   attempted = 결제시도(PG 호출 전). 주문 목록·매출·소유 판정에서 제외한다.
--   expired   = 제한시간 경과. 사용자취소(cancelled)와 구분해 원인을 남긴다.
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status = any (array[
    'draft', 'attempted', 'pending_payment', 'pending_deposit',
    'paid', 'partially_refunded', 'refunded', 'cancelled', 'failed', 'expired'
  ]));

-- 만료 스윕이 훑는 좁은 집합.
create index if not exists orders_stale_checkout_idx
  on public.orders (created_at)
  where status in ('attempted', 'pending_payment');

-- ★결제 승인 응답과 웹훅이 동시에 도착해도 결제 레코드가 두 벌 생기지 않게.
--   (적용 전 중복 0건 확인함)
create unique index if not exists payments_toss_payment_key_uidx
  on public.payments (toss_payment_key)
  where toss_payment_key is not null;

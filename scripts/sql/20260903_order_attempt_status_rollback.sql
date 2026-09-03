-- 원복 — attempted/expired 주문이 남아 있으면 제약 복원이 실패한다. 먼저 확인할 것.
--   select status, count(*) from orders where status in ('attempted','expired') group by 1;
drop index if exists public.payments_toss_payment_key_uidx;
drop index if exists public.orders_stale_checkout_idx;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status = any (array[
    'draft', 'pending_payment', 'pending_deposit',
    'paid', 'partially_refunded', 'refunded', 'cancelled', 'failed'
  ]));

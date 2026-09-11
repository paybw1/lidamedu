-- feat-8-031 강사 정산현황 — 정산 원천을 강의 플랫폼 주문(order_items)까지 확장 + 수수료·세금 스냅샷.
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260912_settlement_sources.sql

-- 1) 주문 결제 시각 SSOT — orders.paid_at (무통장은 입금 확인 시각).
--    정산 월 귀속은 created_at 이 아니라 이 값으로 잡는다 — 월말 주문·익월 입금 확인 건이
--    이미 확정된 달에 묻혀 영영 정산에서 빠지는 구멍을 막는다.
alter table public.orders add column if not exists paid_at timestamptz;
comment on column public.orders.paid_at is
  '결제 완료(무통장은 입금 확인) 시각 — markOrderPaidAndFulfill 이 첫 전이 때 기록. 강사 정산 월 귀속 기준';
update public.orders o
   set paid_at = coalesce(
     (select min(p.created_at) from public.payments p
       where p.order_id = o.order_id and p.status in ('completed', 'refunded')),
     (select bt.deposited_at from public.bank_transfers bt where bt.order_id = o.order_id limit 1),
     o.updated_at)
 where o.paid_at is null
   and o.status in ('paid', 'partially_refunded', 'refunded');
create index if not exists orders_paid_at_idx on public.orders (paid_at) where paid_at is not null;

-- 2) 정산 항목 — 원천이 payment(구독 직접 결제) 또는 order_item(강의 플랫폼 주문) 중 정확히 하나.
alter table public.instructor_settlement_items alter column payment_id drop not null;
alter table public.instructor_settlement_items
  add column if not exists order_item_id uuid references public.order_items(order_item_id) on delete restrict;
alter table public.instructor_settlement_items
  drop constraint if exists instructor_settlement_items_source_check;
alter table public.instructor_settlement_items
  add constraint instructor_settlement_items_source_check
  check (num_nonnulls(payment_id, order_item_id) = 1);
create index if not exists instructor_settlement_items_order_item_idx
  on public.instructor_settlement_items (order_item_id);
alter table public.instructor_settlement_items
  add column if not exists fee_krw integer not null default 0,
  add column if not exists settle_base_krw integer not null default 0;
comment on column public.instructor_settlement_items.fee_krw is
  'PG 수수료 귀속분 — share 양수, refund_adjustment 음수(환불 시 수수료 환급)';
comment on column public.instructor_settlement_items.settle_base_krw is
  '정산 기준액(매출) = 기준액 − 수수료. share 양수 / refund_adjustment 음수. 정산금액 = 이 값 × 비율';
-- 기존 행 백필 — 수수료 0 시절이므로 기준액 그대로(부호는 kind 에 따라).
update public.instructor_settlement_items
   set settle_base_krw = case when kind = 'refund_adjustment' then -base_amount_krw else base_amount_krw end
 where settle_base_krw = 0 and base_amount_krw <> 0;

-- 3) 정산서 합계·파라미터 스냅샷 (생성 때 계산, 확정 후 불변).
alter table public.instructor_settlements
  add column if not exists gross_krw integer not null default 0,
  add column if not exists refund_krw integer not null default 0,
  add column if not exists fee_krw integer not null default 0,
  add column if not exists net_sales_krw integer not null default 0,
  add column if not exists fee_rate_bp integer not null default 0,
  add column if not exists tax_type text not null default 'withholding'
    check (tax_type in ('withholding', 'invoice', 'none')),
  add column if not exists tax_rate_bp integer not null default 0,
  add column if not exists tax_krw integer not null default 0,
  add column if not exists payout_krw integer not null default 0;
comment on column public.instructor_settlements.gross_krw is '결제(매출 총액) = Σ share 기준액';
comment on column public.instructor_settlements.refund_krw is '환불 = Σ refund_adjustment 기준액';
comment on column public.instructor_settlements.fee_krw is '수수료 = (결제 − 환불) × fee_rate_bp/10000 (항목 합)';
comment on column public.instructor_settlements.net_sales_krw is '매출(정산 기준 총금액) = 결제 − 환불 − 수수료';
comment on column public.instructor_settlements.tax_krw is '세금액 = 정산금액(total_share_krw) × tax_rate_bp/10000';
comment on column public.instructor_settlements.payout_krw is '정산 지급액 = 정산금액 − 세금액';

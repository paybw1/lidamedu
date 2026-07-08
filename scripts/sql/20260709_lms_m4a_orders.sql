-- feat-11-004 슬라이스 4a — 주문 일반화 (설계 §3.8, M4 착수 승인 2026-07-08)
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260709_lms_m4a_orders.sql → npm run db:typegen
-- ★이중 경로 금지(리스크 2): 이 시점부터 plan 단건 결제도 1-item 주문을 경유(payments.order_id).
--   payments 는 결제 트랜잭션 레코드로 유지 — 토스 confirm/웹훅 파이프 재사용.

create table public.orders (
  order_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  status text not null default 'pending_payment' check (status in (
    'draft',            -- 장바구니(예약 — 현재 미사용)
    'pending_payment',  -- 결제 대기(토스 위젯 진행 중)
    'pending_deposit',  -- 무통장/가상계좌 입금 대기 (4b)
    'paid',             -- 결제 완료·지급됨
    'partially_refunded',
    'refunded',
    'cancelled',        -- 결제 전 취소(기한 초과 등)
    'failed'
  )),
  total_krw int not null check (total_krw >= 0),
  discount_id uuid references public.discounts (discount_id) on delete set null,
  payment_method text not null default 'toss' check (payment_method in ('toss','bank_transfer','free','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  order_item_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (order_id) on delete cascade,
  item_type text not null check (item_type in ('plan','book')),
  plan_id uuid references public.subscription_plans (plan_id) on delete restrict,
  book_id uuid,                     -- 4c 에서 books FK 승격 (도서몰)
  -- 자기학습 과목별 결제 축(기존 payments.subject_code 의미) — plan 항목 전용.
  subject_code text,
  quantity int not null default 1 check (quantity >= 1),
  unit_price_krw int not null check (unit_price_krw >= 0),
  refunded_at timestamptz,
  refund_amount_krw int,
  refund_reason text,
  created_at timestamptz not null default now(),
  check (
    (item_type = 'plan' and plan_id is not null and book_id is null)
    or (item_type = 'book' and book_id is not null and plan_id is null)
  )
);
create index order_items_order_idx on public.order_items (order_id);

-- 결제 트랜잭션 ↔ 주문 연결
alter table public.payments
  add column order_id uuid references public.orders (order_id) on delete set null;
create index payments_order_idx on public.payments (order_id);

-- 수강권 지급 소스 FK 승격 (M2 에서 자리만 뒀던 컬럼)
alter table public.enrollments
  add constraint enrollments_order_item_fk
  foreign key (order_item_id) references public.order_items (order_item_id) on delete set null;

-- RLS — 본인+staff 읽기, 쓰기는 서버(adminClient) 전용(정책 없음)
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy orders_select_own_or_staff on public.orders
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
create policy order_items_select_own_or_staff on public.order_items
  for select using (
    exists (select 1 from public.orders o
            where o.order_id = order_items.order_id
              and o.user_id = (select auth.uid()))
    or private.is_staff((select auth.uid()))
  );

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

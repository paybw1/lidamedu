-- feat-11-004 슬라이스 4c — 도서몰 (설계 §3.9)
-- books + 재고 원장(book_stock_moves, append-only — 재고 현황=SUM 파생) + 상품↔교재 연결 + 배송.

create table public.books (
  book_id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  publisher text,
  price_krw int not null check (price_krw >= 0),
  sale_status text not null default 'scheduled' check (sale_status in ('scheduled','on_sale','paused','closed','hidden')),
  cover_path text,
  description text,
  isbn text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.book_stock_moves (
  move_id bigint generated always as identity primary key,
  book_id uuid not null references public.books (book_id) on delete restrict,
  delta int not null check (delta <> 0),          -- +입고 / -판매·파손 / +환불복원
  reason text not null check (reason in ('inbound','sale','refund','adjust')),
  order_item_id uuid references public.order_items (order_item_id) on delete set null,
  actor_id uuid references public.profiles (profile_id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index book_stock_moves_book_idx on public.book_stock_moves (book_id);

-- 재고 현황 파생 뷰
create view public.v_book_stock with (security_invoker = true) as
select b.book_id,
       coalesce((select sum(m.delta) from public.book_stock_moves m where m.book_id = b.book_id), 0)::int as stock
from public.books b;

-- 강의 상품 ↔ 교재 연결 (결제 화면 함께 구매 유도)
create table public.plan_book_links (
  plan_id uuid not null references public.subscription_plans (plan_id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  requirement text not null default 'optional' check (requirement in ('required','optional')),
  primary key (plan_id, book_id)
);

-- 배송 (도서 항목 단위)
create table public.shipments (
  shipment_id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (order_item_id) on delete cascade,
  status text not null default 'preparing' check (status in ('preparing','shipped','delivered','returned')),
  courier text,
  tracking_no text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  address jsonb,                                   -- 주문 시점 스냅샷 {recipient, phone, postcode, address1, address2}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id)
);

-- order_items.book_id FK 승격 (4a 에서 자리만)
alter table public.order_items
  add constraint order_items_book_fk
  foreign key (book_id) references public.books (book_id) on delete restrict;

-- RLS
alter table public.books enable row level security;
alter table public.book_stock_moves enable row level security;
alter table public.plan_book_links enable row level security;
alter table public.shipments enable row level security;

create policy books_select_public on public.books
  for select using (
    (sale_status in ('on_sale','paused','closed') and deleted_at is null)
    or private.is_staff((select auth.uid()))
  );
create policy books_write_staff on public.books
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy book_stock_moves_select_staff on public.book_stock_moves
  for select using (private.is_staff((select auth.uid())));
create policy plan_book_links_select_all on public.plan_book_links
  for select using (true);
create policy plan_book_links_write_staff on public.plan_book_links
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
-- 배송: 본인(마이페이지 즉시 반영) + staff 읽기. 쓰기는 서버·staff.
create policy shipments_select_own_or_staff on public.shipments
  for select using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.order_id = oi.order_id
      where oi.order_item_id = shipments.order_item_id
        and o.user_id = (select auth.uid())
    )
    or private.is_staff((select auth.uid()))
  );
create policy shipments_write_staff on public.shipments
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

create trigger books_updated_at before update on public.books
  for each row execute function public.set_updated_at();
create trigger shipments_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

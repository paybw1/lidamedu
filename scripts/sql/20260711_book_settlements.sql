-- feat-8-029 P6 — 도서정산 계산·지급(강사정산 instructor_settlements 와 동형).
-- 월 단위 정산: 도서 판매 order_items 에 배분규칙 적용 → payee(저자/출판사)별 정산.
-- draft 재생성 가능 / confirmed·paid 불변. 확정분 환불은 익월 음수 차감(이중계상 방지).

create table if not exists public.book_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  payee_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  total_share_krw integer not null default 0,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(profile_id),
  paid_at timestamptz,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  unique (payee_name, period_start)
);

create table if not exists public.book_settlement_items (
  item_id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.book_settlements(settlement_id) on delete cascade,
  order_item_id uuid not null references public.order_items(order_item_id) on delete cascade,
  rule_id uuid references public.book_settlement_rules(rule_id) on delete set null,
  kind text not null check (kind in ('share', 'refund_adjustment')),
  share_kind text not null check (share_kind in ('percent', 'fixed')),
  share_value integer not null,
  base_amount_krw integer not null,
  share_amount_krw integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists book_settlement_items_settlement_idx
  on public.book_settlement_items (settlement_id);
create index if not exists book_settlement_items_order_item_idx
  on public.book_settlement_items (order_item_id, kind);
create index if not exists book_settlements_period_idx
  on public.book_settlements (period_start desc);

-- RLS: 정산 테이블과 동일 — enable + 정책 없음(service_role/adminClient 전용).
alter table public.book_settlements enable row level security;
alter table public.book_settlement_items enable row level security;

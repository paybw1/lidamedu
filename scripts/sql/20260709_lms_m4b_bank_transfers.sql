-- feat-11-004 슬라이스 4b — 무통장 입금 (설계 §3.8)
-- 흐름: 주문(pending_deposit)+bank_transfers 생성 → 관리자 입금 확인(confirmed_by) → paid 전이·지급.
-- 기한(expires_at) 초과 미입금은 취소(관리자 화면 lazy + cron).

create table public.bank_transfers (
  transfer_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (order_id) on delete cascade,
  depositor_name text not null,
  expected_amount_krw int not null check (expected_amount_krw >= 0),
  deposited_at timestamptz,             -- 입금 확인 시각(관리자 기록)
  confirmed_by uuid references public.profiles (profile_id) on delete set null,
  expires_at timestamptz not null,      -- 입금 기한 — 초과 시 주문 취소
  memo text,
  created_at timestamptz not null default now(),
  unique (order_id)                     -- 주문당 무통장 신청 1건
);
create index bank_transfers_pending_idx on public.bank_transfers (expires_at) where deposited_at is null;

alter table public.bank_transfers enable row level security;
create policy bank_transfers_select_own_or_staff on public.bank_transfers
  for select using (
    exists (select 1 from public.orders o
            where o.order_id = bank_transfers.order_id
              and o.user_id = (select auth.uid()))
    or private.is_staff((select auth.uid()))
  );
-- 쓰기 정책 없음 — 서버(adminClient) 전용.

-- feat-13 학생 마이페이지 — 포인트 원장(point_transactions).
-- (user_coupons 는 feat-11-004 discounts 시스템에 이미 존재 — 재사용.)
create table if not exists public.point_transactions (
  txn_id        uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (profile_id) on delete cascade,
  delta         int not null,                            -- +적립 / -사용
  reason        text,
  balance_after int,
  created_at    timestamptz not null default now()
);
create index if not exists point_transactions_user_idx
  on public.point_transactions (user_id, created_at desc);

alter table public.point_transactions enable row level security;
grant select, insert on public.point_transactions to authenticated;
drop policy if exists point_transactions_self on public.point_transactions;
create policy point_transactions_self on public.point_transactions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
drop policy if exists point_transactions_staff_insert on public.point_transactions;
create policy point_transactions_staff_insert on public.point_transactions for insert to authenticated
  with check (private.is_staff((select auth.uid())));

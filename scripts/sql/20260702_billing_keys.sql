-- feat-8-028 Stage 5 — 매월 자동결제(Toss 빌링). 카드 빌링키 저장.
-- 빌링키는 service_role(서버)만 발급·저장. 사용자는 본인 것 읽기만(카드 표시용).

create table if not exists public.billing_keys (
  billing_key_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  billing_key text not null,
  customer_key text not null,
  card_company text,
  card_number_masked text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists billing_keys_user_active_idx
  on public.billing_keys (user_id)
  where deleted_at is null;

alter table public.billing_keys enable row level security;

-- 본인 빌링키만 조회(카드사·마스킹 번호 표시용). 쓰기는 service_role 전용(정책 없음).
drop policy if exists billing_keys_select_own on public.billing_keys;
create policy billing_keys_select_own on public.billing_keys
  for select using (auth.uid() = user_id);

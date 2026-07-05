-- 수강권 운영자 재량 조정 감사 — 부여자·메모 컬럼 + 조정 이력 로그.
-- 로그는 운영자 전용(RLS enable + 정책 없음 = adminClient 만).

alter table public.user_subscriptions
  add column if not exists granted_by uuid references public.profiles(profile_id) on delete set null,
  add column if not exists admin_note text;

comment on column public.user_subscriptions.granted_by is '수동 부여한 운영자 (결제 없는 재량 부여 표식 — payment_id null 과 함께)';
comment on column public.user_subscriptions.admin_note is '운영자 부여/조정 사유 메모(최신)';

create table if not exists public.subscription_admin_logs (
  log_id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.user_subscriptions(subscription_id) on delete set null,
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  actor_id uuid references public.profiles(profile_id) on delete set null,
  action text not null check (action in ('grant', 'extend', 'cancel', 'auto_cancel')),
  -- 변경 상세 스냅샷 (plan_code, days, before/after expires_at 등)
  detail jsonb,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.subscription_admin_logs is '수강권 운영자 조정 이력 — 누가/언제/무엇을/왜 (재량 조정 감사)';

create index if not exists subscription_admin_logs_user_idx
  on public.subscription_admin_logs (user_id, created_at desc);
create index if not exists subscription_admin_logs_sub_idx
  on public.subscription_admin_logs (subscription_id, created_at desc);

alter table public.subscription_admin_logs enable row level security;

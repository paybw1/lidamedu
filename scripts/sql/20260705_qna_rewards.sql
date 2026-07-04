-- feat-7-042 Q&A 답변 적립·지급 — 강사 답변 1건당 정액 적립, 한도 도달 시 지급.
-- 취지: 답변 저작물 이용 대가 — 적립·지급된 크레딧은 답변 수정·삭제·강사 변경과 무관하게 유지.
-- 접근: 운영자 화면 전용(adminClient) — RLS enable + 정책 없음.

create table if not exists public.qna_reward_payouts (
  payout_id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  amount_krw integer not null check (amount_krw > 0),
  credit_count integer not null default 0,
  memo text,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles(profile_id) on delete set null
);

create table if not exists public.instructor_qna_credits (
  credit_id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  thread_id uuid not null unique references public.qna_threads(thread_id) on delete cascade,
  amount_krw integer not null check (amount_krw >= 0),
  payout_id uuid references public.qna_reward_payouts(payout_id) on delete set null,
  created_at timestamptz not null default now()
);

-- 단일 행 설정 — id=true 고정.
create table if not exists public.qna_reward_settings (
  id boolean primary key default true check (id),
  unit_krw integer not null default 500 check (unit_krw >= 0),
  payout_threshold_krw integer not null default 50000 check (payout_threshold_krw > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(profile_id) on delete set null
);
insert into public.qna_reward_settings (id) values (true) on conflict (id) do nothing;

create index if not exists instructor_qna_credits_instructor_idx
  on public.instructor_qna_credits (instructor_id) where payout_id is null;

alter table public.qna_reward_payouts enable row level security;
alter table public.instructor_qna_credits enable row level security;
alter table public.qna_reward_settings enable row level security;

comment on table public.instructor_qna_credits is 'feat-7-042 Q&A 답변 적립 — 스레드당 1건(unique), 단가 스냅샷. 답변 수정·삭제와 무관하게 유지(저작권 이용 대가)';
comment on table public.qna_reward_payouts is 'feat-7-042 지급 이력 — 한도 도달 시 미지급 크레딧 일괄 지급';

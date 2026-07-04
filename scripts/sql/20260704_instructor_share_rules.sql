-- feat-8-029 Stage 2 — 강사 배분 기준.
-- 규칙 = 강사 × 적용대상(특정 상품 > 과목 > 전체, 구체적일수록 우선) × 정률(%)/정액(원).
-- 배분액: percent = 순매출(결제-환불) × value% / fixed = 결제 1건당 value원(환불 시 비례 차감).
-- 접근: 운영자 화면 전용(adminClient/service_role) — RLS enable + 정책 없음 = 일반 클라이언트 전면 차단.

create table if not exists public.instructor_share_rules (
  rule_id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  target_kind text not null check (target_kind in ('plan', 'subject', 'all')),
  target_plan_id uuid references public.subscription_plans(plan_id) on delete cascade,
  target_subject_code text,
  share_kind text not null check (share_kind in ('percent', 'fixed')),
  share_value integer not null check (share_value > 0),
  effective_from date not null default current_date,
  is_active boolean not null default true,
  memo text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint share_rules_target_chk check (
    (target_kind = 'plan' and target_plan_id is not null)
    or (target_kind = 'subject' and target_subject_code is not null)
    or (target_kind = 'all')
  ),
  constraint share_rules_percent_range_chk check (share_kind <> 'percent' or share_value <= 100)
);

comment on table public.instructor_share_rules is 'feat-8-029 강사 배분 기준 — 결제 1건에 강사별로 가장 구체적인 활성 규칙 1개 적용(plan > subject > all, 동급이면 effective_from 최신)';
comment on column public.instructor_share_rules.share_value is 'percent: 1~100(%), fixed: 결제 1건당 원';

create index if not exists instructor_share_rules_instructor_idx
  on public.instructor_share_rules (instructor_id) where is_active;

alter table public.instructor_share_rules enable row level security;

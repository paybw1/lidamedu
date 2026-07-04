-- feat-8-029 Stage 3 — 강사 정산.
-- 월 단위 정산: 해당 월 결제(completed·refunded)에 배분 규칙을 적용해 강사별 초안 생성.
-- 항목은 규칙·배분율을 스냅샷으로 저장(규칙이 이후 바뀌어도 지급 근거 불변).
-- 확정(confirmed) 후 발생한 환불은 다음 정산 생성 시 음수 항목(kind=refund_adjustment)으로 차감.
-- 접근: 운영자 화면 전용(adminClient) — RLS enable + 정책 없음 = 일반 클라이언트 전면 차단.

create table if not exists public.instructor_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  period_start date not null, -- 정산 대상 월 1일 (KST)
  period_end date not null,   -- 다음 달 1일 (exclusive)
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  total_share_krw integer not null default 0,
  memo text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(profile_id) on delete set null,
  paid_at timestamptz,
  unique (instructor_id, period_start)
);

create table if not exists public.instructor_settlement_items (
  item_id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.instructor_settlements(settlement_id) on delete cascade,
  payment_id uuid not null references public.payments(payment_id) on delete restrict,
  rule_id uuid references public.instructor_share_rules(rule_id) on delete set null,
  kind text not null default 'share' check (kind in ('share', 'refund_adjustment')),
  -- 스냅샷 — 계산 근거 (규칙·결제가 이후 변해도 불변)
  share_kind text not null check (share_kind in ('percent', 'fixed')),
  share_value integer not null,
  base_amount_krw integer not null, -- share: 결제액 / refund_adjustment: 환불액(음수 아님)
  share_amount_krw integer not null, -- 배분액. refund_adjustment 는 음수
  note text,
  created_at timestamptz not null default now()
);

comment on table public.instructor_settlements is 'feat-8-029 강사 월 정산 — draft → confirmed → paid';
comment on table public.instructor_settlement_items is 'feat-8-029 정산 항목 — 결제 1건 × 적용 규칙 스냅샷. kind=refund_adjustment 는 확정 후 환불 차감(음수)';

create index if not exists instructor_settlements_period_idx
  on public.instructor_settlements (period_start, instructor_id);
create index if not exists instructor_settlement_items_settlement_idx
  on public.instructor_settlement_items (settlement_id);
create index if not exists instructor_settlement_items_payment_idx
  on public.instructor_settlement_items (payment_id);

alter table public.instructor_settlements enable row level security;
alter table public.instructor_settlement_items enable row level security;

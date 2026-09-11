-- feat-8-031 정산 파라미터 — PG 수수료율(전체 1개) + 강사별 세금 유형.
-- RLS enable + 정책 없음 = 일반 클라이언트 전면 차단, adminClient(service_role) 경유만(정산 테이블과 동일).
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260912_settlement_params.sql

create table if not exists public.settlement_settings (
  id smallint primary key default 1 check (id = 1),
  pg_fee_rate_bp integer not null default 0 check (pg_fee_rate_bp between 0 and 10000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(profile_id) on delete set null
);
comment on table public.settlement_settings is
  'feat-8-031 정산 파라미터 단일 행 — pg_fee_rate_bp: PG 수수료율(bp, 330 = 3.30%). 0 = 미설정';
insert into public.settlement_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.instructor_settlement_profiles (
  instructor_id uuid primary key references public.profiles(profile_id) on delete cascade,
  tax_type text not null default 'withholding' check (tax_type in ('withholding', 'invoice', 'none')),
  tax_rate_bp integer not null default 330 check (tax_rate_bp between 0 and 10000),
  memo text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(profile_id) on delete set null
);
comment on table public.instructor_settlement_profiles is
  'feat-8-031 강사별 세금 유형 — withholding: 개인 사업소득 원천징수(기본 3.3%) / invoice: 사업자 세금계산서(0%) / none. 행 없으면 withholding 330bp';

alter table public.settlement_settings enable row level security;
alter table public.instructor_settlement_profiles enable row level security;

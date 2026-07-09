-- feat-13 쿠폰 관리(운영자 · 매출·정산) — 쿠폰 정의 테이블.
-- staff 전용(공개 읽기 없음). 학생 쿠폰함/적용은 추후.
create table if not exists public.coupons (
  coupon_id      uuid primary key default gen_random_uuid(),
  code           text not null unique,                    -- 쿠폰ID(표시/입력용)
  name           text not null check (length(name) between 1 and 100),
  scope          text not null default 'all'
                   check (scope in ('all', 'course_package', 'course', 'package', 'book', 'product')),
  min_amount     int not null default 0 check (min_amount >= 0),        -- 최소금액
  discount_type  text not null check (discount_type in ('fixed', 'percent')),
  discount_value int not null check (discount_value >= 0),              -- 정액=원, 정률=%
  max_discount   int check (max_discount is null or max_discount >= 0), -- 정률 최대 할인금액(선택)
  is_shared      boolean not null default true,           -- 공용(true)/개별(false)
  issue_count    int not null default 0 check (issue_count >= 0),       -- 발행수
  valid_from     date not null,                           -- 유효기간 시작
  valid_to       date not null,                           -- 유효기간 끝
  usable_days    int check (usable_days is null or usable_days >= 0),   -- 사용일수(선택)
  status         text not null default 'active'
                   check (status in ('active', 'stopped')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists coupons_list_idx
  on public.coupons (created_at desc) where deleted_at is null;

drop trigger if exists set_updated_at on public.coupons;
create trigger set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

-- RLS: staff 만 조회·쓰기(공개 없음).
alter table public.coupons enable row level security;
grant select, insert, update on public.coupons to authenticated;
drop policy if exists coupons_staff_all on public.coupons;
create policy coupons_staff_all on public.coupons for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

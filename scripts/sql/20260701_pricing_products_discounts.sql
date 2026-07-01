-- feat-8-028 Stage A — 요금·상품·할인 모델.
-- 구매 상품 = subscription_plans row(가격 + 부여 과목 + 기능). 과목·번들·회원제 통일.
-- 할인 = 별도 discounts 테이블(기간·조건·쿠폰). 오픈 전이라 레거시 pro_monthly 는 은퇴.

-- 1) subscription_plans 확장: 부여 과목 + 상품 종류.
alter table public.subscription_plans
  add column if not exists subject_codes jsonb not null default '[]'::jsonb,
  add column if not exists product_kind text not null default 'membership';
alter table public.subscription_plans
  drop constraint if exists subscription_plans_product_kind_check;
alter table public.subscription_plans
  add constraint subscription_plans_product_kind_check
    check (product_kind in ('subject', 'bundle', 'membership'));

-- 기존 플랜 종류 세팅 + pro_monthly 은퇴(오픈 전, 레거시 무시).
update public.subscription_plans
  set product_kind = 'membership'
  where code in ('free', 'cohort');
update public.subscription_plans
  set is_active = false, product_kind = 'membership'
  where code = 'pro_monthly';

-- 2) 상품 시드 — 개별 4과목(1차) + 번들 2종. features = 자기학습 기능 세트(area 접근).
--    가격은 운영자가 조정할 placeholder. 자연과학은 기본 무료라 상품 없음.
--    민사소송법(civil-procedure)은 2차 과목 — 전체통합(1차)에 넣지 않는다. 2차는 추후 별도 프로그램.
insert into public.subscription_plans
  (code, name, description, price_krw, duration_days, features, subject_codes, product_kind, display_order, is_active)
values
  ('subj_patent', '특허법', '특허법 단과 (조문·판례·문제 학습)', 99000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["patent"]'::jsonb, 'subject', 10, true),
  ('subj_trademark', '상표법', '상표법 단과', 99000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["trademark"]'::jsonb, 'subject', 11, true),
  ('subj_design', '디자인보호법', '디자인보호법 단과', 99000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["design"]'::jsonb, 'subject', 12, true),
  ('subj_civil', '민법', '민법 단과', 99000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["civil"]'::jsonb, 'subject', 13, true),
  ('bundle_ip', '산업재산권법 통합', '특허·상표·디자인 3과목 통합 (1차)', 249000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["patent","trademark","design"]'::jsonb, 'bundle', 20, true),
  ('bundle_all', '1차 전체 통합', '1차 전 과목 통합 (특허·상표·디자인·민법)', 299000, 30,
   '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb,
   '["patent","trademark","design","civil"]'::jsonb, 'bundle', 21, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  price_krw = excluded.price_krw,
  duration_days = excluded.duration_days,
  features = excluded.features,
  subject_codes = excluded.subject_codes,
  product_kind = excluded.product_kind,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

-- 3) 할인 — 기간·조건·쿠폰. target_kind: all/subject/bundle/plan(대상 코드 배열).
create table if not exists public.discounts (
  discount_id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,                       -- null = 자동 프로모션(코드 불필요)
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value >= 0),
  target_kind text not null default 'all'
    check (target_kind in ('all', 'subject', 'bundle', 'plan')),
  target_plan_codes jsonb not null default '[]'::jsonb,  -- target_kind='plan' 대상 코드
  starts_at timestamptz,                  -- null = 즉시
  ends_at timestamptz,                    -- null = 무기한
  min_amount_krw integer,                 -- 조건: 최소 결제액
  max_uses integer,                       -- 조건: 총 사용 한도
  used_count integer not null default 0,
  per_user_limit integer,                 -- 조건: 사용자당 한도
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 활성 할인은 공개 읽기(가격표 표시), 쓰기는 service_role(admin)만.
alter table public.discounts enable row level security;
drop policy if exists discounts_select_active on public.discounts;
create policy discounts_select_active on public.discounts
  for select using (is_active = true);

-- 4) 결제에 적용된 할인 기록.
alter table public.payments
  add column if not exists discount_id uuid references public.discounts(discount_id);

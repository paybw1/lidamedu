-- feat-8-028 — 상품 오픈일(available_from) + 번들 오픈 할인.
-- 상표법·디자인보호법은 데이터 고도화 중 → 8월부터 학습 가능(개별 상품은 8월 오픈).
-- ★번들은 지금 즉시 판매(available_from 없음) — 상표·디자인은 8월 학습 안내만 표시.

alter table public.subscription_plans
  add column if not exists available_from timestamptz;

-- 개별 상표·디자인 상품만 8월 오픈(KST 2026-08-01). 번들은 즉시 판매.
update public.subscription_plans
  set available_from = '2026-08-01 00:00:00+09'
  where code in ('subj_trademark', 'subj_design');

-- 번들 오픈 할인 — 자동 프로모션(코드 없음) ₩45,000, 대상 번들. 중복 삽입 방지.
insert into public.discounts (name, code, kind, value, target_kind, is_active)
select '번들 오픈 할인', null, 'fixed', 45000, 'bundle', true
where not exists (
  select 1 from public.discounts where name = '번들 오픈 할인'
);

-- 현장강의 일정 → 과정(course) 판매 페이지화: 연결 상품 + 과정소개 + 강의목차
--   plan_code: subscription_plans.code 연결(결제·가격 권위). 없으면 카탈로그로 폴백.
alter table public.lecture_schedules
  add column if not exists plan_code text,
  add column if not exists intro_md text,
  add column if not exists curriculum_md text;

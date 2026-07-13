-- 강의 카탈로그 카테고리 — 상품(subscription_plans) 단위 1차/2차/패키지/현장 분류.
-- 수강신청(/lecture/catalog) 5탭 필터용. nullable = 미분류(전체 탭에만 노출).
alter table public.subscription_plans
  add column if not exists lecture_category text;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_lecture_category_check;
alter table public.subscription_plans
  add constraint subscription_plans_lecture_category_check
  check (
    lecture_category is null
    or lecture_category in ('round1', 'round2', 'package', 'onsite')
  );

-- 확인 — 현재 강의 상품(course/tpass) 목록.
select code, name, product_kind, lecture_category, is_active, sale_status
from public.subscription_plans
where product_kind in ('course', 'tpass', 'bundle')
order by product_kind, display_order, name;

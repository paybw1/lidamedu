-- feat-11-008 P3 — 강의 카테고리 단일화(260807 요청서): course_categories 를 카탈로그 탭의
-- SSOT 로 승격. 하드코딩 enum(round1/round2/package/onsite) 4종을 행으로 시드하고
-- subscription_plans 에 category_id 를 연결·백필한다. lecture_category 컬럼은 보존(쓰기 중단).

alter table public.course_categories
  add column if not exists is_active boolean not null default true;
comment on column public.course_categories.is_active is '미사용 카테고리는 신규 선택 불가·카탈로그 미노출 (feat-11-008)';

alter table public.subscription_plans
  add column if not exists category_id uuid references public.course_categories (category_id) on delete set null;
comment on column public.subscription_plans.category_id is '강의 카테고리(course_categories) — 카탈로그 탭·검색 축 (feat-11-008)';

-- 기존 카탈로그 enum 4종 시드(최상위·동명 존재 시 생략).
insert into public.course_categories (name, sort_order)
select v.name, v.ord
from (values ('1차 강의', 10), ('2차 강의', 20), ('패키지 강의', 30), ('현장 강의', 40)) as v(name, ord)
where not exists (
  select 1 from public.course_categories c
  where c.name = v.name and c.parent_id is null
);

-- 판매 상품 백필: lecture_category → category_id.
update public.subscription_plans p
set category_id = c.category_id
from public.course_categories c
where p.category_id is null
  and c.parent_id is null
  and (
    (p.lecture_category = 'round1' and c.name = '1차 강의')
    or (p.lecture_category = 'round2' and c.name = '2차 강의')
    or (p.lecture_category = 'package' and c.name = '패키지 강의')
    or (p.lecture_category = 'onsite' and c.name = '현장 강의')
  );

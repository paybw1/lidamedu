-- feat-11-010 — order_items 에 'course_extension' 항목 유형 허용.
-- ★A단계 DDL 에서 빠뜨린 부분. 실제로 주문을 만들어 보고서야 드러났다
--   (23514 order_items_check). 컬럼만 더하고 제약을 안 고치면 이렇게 막힌다.

alter table public.order_items
  drop constraint if exists order_items_item_type_check;
alter table public.order_items
  add constraint order_items_item_type_check
  check (item_type = any (array['plan'::text, 'book'::text, 'course_extension'::text]));

-- 유형별 필수 참조 — 연장은 어느 수강권을 늘리는지가 반드시 있어야 한다.
alter table public.order_items
  drop constraint if exists order_items_check;
alter table public.order_items
  add constraint order_items_check check (
    (item_type = 'plan' and plan_id is not null and book_id is null)
    or (item_type = 'book' and book_id is not null and plan_id is null)
    or (
      item_type = 'course_extension'
      and enrollment_id is not null
      and book_id is null
    )
  );

-- feat-11-011 P2 — 주문 항목 표시명 스냅샷.
--
-- 지금은 표시할 때마다 상품·도서를 조인해 이름을 붙인다. 상품명이 바뀌거나 상품이
-- 내려가면 **과거 영수증의 이름까지 같이 바뀐다.** 결제내역은 "그때 산 이름"을 보여야 한다.
-- 연장 항목(course_extension)은 조인할 상품이 아예 없어 내부코드가 그대로 노출됐다.
alter table public.order_items
  add column if not exists title_snapshot text;

-- 기존 38건 백필 — 지금 조인 가능한 값으로.
update public.order_items oi
   set title_snapshot = p.name
  from public.subscription_plans p
 where oi.plan_id = p.plan_id
   and oi.item_type = 'plan'
   and oi.title_snapshot is null;

update public.order_items oi
   set title_snapshot = b.title
  from public.books b
 where oi.book_id = b.book_id
   and oi.item_type = 'book'
   and oi.title_snapshot is null;

-- 연장 항목 — 강의명 + 연장일수. enrollment_extensions 에 실제 값이 있다.
update public.order_items oi
   set title_snapshot = '수강기간 연장'
       || coalesce(' — ' || nullif(trim(coalesce(cs.title, '') || ' ' || coalesce(c.edition_label, '')), ''), '')
       || coalesce(' ' || ex.days_added || '일', '')
  from public.enrollment_extensions ex
  left join public.enrollments e on e.enrollment_id = ex.enrollment_id
  left join public.courses c on c.course_id = e.course_id
  left join public.course_series cs on cs.series_id = c.series_id
 where ex.order_item_id = oi.order_item_id
   and oi.item_type = 'course_extension'
   and oi.title_snapshot is null;

-- 그래도 비어 있는 연장 항목(지급 전 주문 등)은 최소 문구라도 남긴다.
update public.order_items
   set title_snapshot = '수강기간 연장'
 where item_type = 'course_extension' and title_snapshot is null;

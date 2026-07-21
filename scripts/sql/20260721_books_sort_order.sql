-- 도서 관리 — 진열 순서(sort_order) 컬럼. 운영자가 도서 노출 순서를 직접 지정.
begin;

alter table public.books
  add column if not exists sort_order int not null default 0;
create index if not exists books_sort_order_idx on public.books(sort_order);

-- 백필: 현재 보이는 순서(최신 등록순)를 초기 수동 순서로 굳힌다. 10 간격(추후 삽입 여유).
with ordered as (
  select book_id,
         (row_number() over (order by created_at desc)) * 10 as rn
  from public.books
  where deleted_at is null
)
update public.books b
set sort_order = o.rn
from ordered o
where o.book_id = b.book_id;

commit;

select book_id, title, sort_order
from public.books
where deleted_at is null
order by sort_order
limit 20;

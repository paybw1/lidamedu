-- feat-11 재고 정책 — 도서별 재고 관리 여부 플래그.
-- 기본 off(미관리): 판매중이면 항상 구매 가능(재고 0 품절로 오표시 방지).
-- on: v_book_stock 수량 게이트(입고/판매차감/환불복원), 재고 0 = 품절.
alter table public.books
  add column if not exists track_stock boolean not null default false;

-- 이미 재고이동(입고 등)이 기록된 도서는 관리 대상으로 유지 — 기존 재고 표시 보존.
update public.books
  set track_stock = true
where track_stock = false
  and book_id in (select distinct book_id from public.book_stock_moves);

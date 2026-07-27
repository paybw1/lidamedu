-- feat-11-007 #14 — 강의별 주교재/부교재 연결 모델 일원화.
--   실데이터가 있는 plan_book_links(plan_id, book_id, requirement) 를 정본으로 삼고,
--   주/부 구분(book_role)과 노출 순서(sort_order)를 추가한다. (빈 plan_books 는 폐지 예정)
alter table public.plan_book_links
  add column if not exists book_role text not null default 'main'
    check (book_role in ('main', 'sub')),
  add column if not exists sort_order integer not null default 0;

-- 기존 21건은 주교재(main)·순서 0 으로 시작(운영자가 화면에서 조정).

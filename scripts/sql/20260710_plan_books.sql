-- 강의 상품(course/tpass) ↔ 사용 교재(도서) 연결 — 강의별 교재 크로스셀.
-- DRM 감사 ★★★★★ '강의별 사용 도서 연결' 공백 해소.
create table if not exists public.plan_books (
  plan_id uuid not null references public.subscription_plans (plan_id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  -- required=필수교재, recommended=권장교재(크로스셀).
  relation_kind text not null default 'recommended'
    check (relation_kind in ('required', 'recommended')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (plan_id, book_id)
);

alter table public.plan_books enable row level security;

-- 공개 읽기(카탈로그 교재 표시), 쓰기 staff.
drop policy if exists plan_books_select_all on public.plan_books;
create policy plan_books_select_all on public.plan_books
  for select using (true);
drop policy if exists plan_books_write_staff on public.plan_books;
create policy plan_books_write_staff on public.plan_books
  for all using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

create index if not exists plan_books_book_id_idx on public.plan_books (book_id);

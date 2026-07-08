-- Q&A 질문 고유번호 (Q-{n}) — 문제 display_no(P-{n}) 와 동일 패턴.
-- 전역 시퀀스 불변(재정렬 없음), 기존 스레드는 created_at 순 백필.

create sequence if not exists public.qna_thread_display_no_seq;

alter table public.qna_threads add column if not exists display_no bigint;

with ordered as (
  select thread_id, row_number() over (order by created_at, thread_id) as rn
  from public.qna_threads
)
update public.qna_threads t
set display_no = o.rn
from ordered o
where o.thread_id = t.thread_id and t.display_no is null;

select setval(
  'public.qna_thread_display_no_seq',
  greatest((select coalesce(max(display_no), 0) from public.qna_threads), 1)
);

alter table public.qna_threads
  alter column display_no set default nextval('public.qna_thread_display_no_seq');
alter table public.qna_threads alter column display_no set not null;

create unique index if not exists qna_threads_display_no_key
  on public.qna_threads (display_no);

-- feat: 문제 고유 표시번호 display_no — 전역 시퀀스(과목 무관·1회 부여 후 불변).
-- 인용/Q&A 특정용. 표시는 "P-{display_no}". 시퀀스 DEFAULT 라 시드 스크립트 무수정.

create sequence if not exists problems_display_no_seq;

alter table public.problems
  add column if not exists display_no bigint;

-- 기존 데이터 백필: created_at, problem_id 결정적 순서로 1..N (순서 불변).
with ordered as (
  select problem_id,
         row_number() over (order by created_at, problem_id) as rn
  from public.problems
  where display_no is null
)
update public.problems p
  set display_no = o.rn
  from ordered o
  where p.problem_id = o.problem_id;

-- 시퀀스를 현재 max 다음으로 → 신규 insert 는 이어서 부여.
select setval(
  'problems_display_no_seq',
  coalesce((select max(display_no) from public.problems), 0) + 1,
  false
);

-- 신규 insert 자동 부여 + 유일·필수.
alter table public.problems
  alter column display_no set default nextval('problems_display_no_seq');
alter table public.problems
  alter column display_no set not null;

create unique index if not exists problems_display_no_key
  on public.problems (display_no);

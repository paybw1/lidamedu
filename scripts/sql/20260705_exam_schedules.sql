-- 시험 일정 SSOT (사용자 요청 2026-07-05) — 연도×차수별 시험일.
-- 학생은 목표 설정에서 "2027년 1차"처럼 연도·차수만 고르고 시험일은 여기서 자동 파생.
-- 쓰기 = 운영자(/admin/exam-schedules, adminClient). 읽기 = 로그인 사용자 전체(목표 폼 옵션).

create table if not exists public.exam_schedules (
  exam_year integer not null check (exam_year between 2020 and 2100),
  exam_round text not null check (exam_round in ('first', 'second')),
  exam_date date not null,
  memo text,
  updated_at timestamptz not null default now(),
  primary key (exam_year, exam_round)
);

alter table public.exam_schedules enable row level security;
drop policy if exists exam_schedules_read on public.exam_schedules;
create policy exam_schedules_read on public.exam_schedules
  for select to authenticated using (true);

comment on table public.exam_schedules is '변리사 시험 일정 — 연도×차수별 시험일(운영자 관리). 학생 목표 폼의 시험일 자동 파생 소스';

-- 2027년 1차 = 2027-02-27 (사용자 제공).
insert into public.exam_schedules (exam_year, exam_round, exam_date)
values (2027, 'first', '2027-02-27')
on conflict (exam_year, exam_round) do update set exam_date = excluded.exam_date, updated_at = now();

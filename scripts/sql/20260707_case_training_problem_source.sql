-- feat-2-028 Stage 1: 쟁점·목차 훈련 소스 확장 — 판례 XOR 2차 기출 문항.
-- 기존 2행은 case_id 만 있음(XOR 통과). 학생 노출은 Stage 2 전까지 case 소스만.
alter table public.case_training_items
  alter column case_id drop not null;

alter table public.case_training_items
  add column if not exists problem_id uuid references public.problems(problem_id);

alter table public.case_training_items
  drop constraint if exists case_training_items_source_xor;
alter table public.case_training_items
  add constraint case_training_items_source_xor
  check ((case_id is null) <> (problem_id is null));

create index if not exists case_training_items_problem_idx
  on public.case_training_items (problem_id);

comment on column public.case_training_items.problem_id is
  '2차 기출 문항 소스(발문=지문). case_id 와 XOR — feat-2-028';

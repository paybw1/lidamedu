-- feat-7-042 — 오프라인 테스트 (종합반 시험지 제작·PDF·결과 입력·통합 통계).
-- offline_tests(과제 1:N) / offline_test_questions(빈칸·OX·객관식 조합) /
-- offline_test_results(학생별 점수 스냅샷 — 문항별 정오는 quiz_sessions+attempts 로 합류).

create table if not exists public.offline_tests (
  test_id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(assignment_id) on delete cascade,
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  title text not null,
  law_code text not null check (law_code in ('patent', 'trademark', 'design', 'civil', 'civil-procedure')),
  duration_min integer,
  instructions_md text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.offline_tests is '오프라인 시험지 — 과제(assignment)에 붙는 빈칸/OX/객관식 조합 테스트';

create index if not exists offline_tests_assignment_idx
  on public.offline_tests (assignment_id) where deleted_at is null;
create index if not exists offline_tests_cohort_idx
  on public.offline_tests (cohort_id) where deleted_at is null;

create table if not exists public.offline_test_questions (
  question_id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.offline_tests(test_id) on delete cascade,
  ord integer not null,
  points numeric(5,1) not null default 1,
  question_type text not null check (question_type in ('mcq', 'ox', 'blank')),
  -- mcq
  problem_id uuid references public.problems(problem_id) on delete cascade,
  -- ox — ref 는 choice/box 폴리모픽이라 FK 없음, 소속 문제만 FK
  ox_ref_type text check (ox_ref_type in ('choice', 'box')),
  ox_ref_id uuid,
  ox_problem_id uuid references public.problems(problem_id) on delete cascade,
  -- blank — 세트 전체 = 1문항
  blank_set_id uuid references public.article_blank_sets(set_id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 유형별 참조 XOR
  constraint offline_test_questions_ref_check check (
    (question_type = 'mcq' and problem_id is not null
      and ox_ref_type is null and ox_ref_id is null and ox_problem_id is null and blank_set_id is null)
    or
    (question_type = 'ox' and ox_ref_type is not null and ox_ref_id is not null and ox_problem_id is not null
      and problem_id is null and blank_set_id is null)
    or
    (question_type = 'blank' and blank_set_id is not null
      and problem_id is null and ox_ref_type is null and ox_ref_id is null and ox_problem_id is null)
  )
);

comment on table public.offline_test_questions is '오프라인 시험지 문항 — ord 순서, 유형별 참조 XOR';

create index if not exists offline_test_questions_test_idx
  on public.offline_test_questions (test_id, ord);

create table if not exists public.offline_test_results (
  result_id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.offline_tests(test_id) on delete cascade,
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  status text not null default 'taken' check (status in ('taken', 'absent')),
  score numeric(6,1),
  max_score numeric(6,1),
  -- 입력 당시 오답 문항 ord 스냅샷 (표시용 — 정오 원본은 세션 attempts)
  wrong_ords integer[] not null default '{}',
  -- 신호 합류로 만든 학생 명의 quiz_session (재입력 시 재사용)
  session_id uuid references public.quiz_sessions(session_id) on delete set null,
  taken_at date,
  note text,
  entered_by uuid references public.profiles(profile_id) on delete set null,
  entered_at timestamptz not null default now(),
  unique (test_id, user_id)
);

comment on table public.offline_test_results is '오프라인 시험 결과 스냅샷 — 문항별 정오는 session_id 의 attempts 가 원본';

create index if not exists offline_test_results_user_idx
  on public.offline_test_results (user_id);

-- RLS — 테스트·문항은 staff 전용, 결과는 staff 전체 + 학생 본인 read.
alter table public.offline_tests enable row level security;
alter table public.offline_test_questions enable row level security;
alter table public.offline_test_results enable row level security;

drop policy if exists offline_tests_staff_all on public.offline_tests;
create policy offline_tests_staff_all
  on public.offline_tests for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

drop policy if exists offline_test_questions_staff_all on public.offline_test_questions;
create policy offline_test_questions_staff_all
  on public.offline_test_questions for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

drop policy if exists offline_test_results_staff_all on public.offline_test_results;
create policy offline_test_results_staff_all
  on public.offline_test_results for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

drop policy if exists offline_test_results_select_own on public.offline_test_results;
create policy offline_test_results_select_own
  on public.offline_test_results for select
  to authenticated
  using (user_id = auth.uid());

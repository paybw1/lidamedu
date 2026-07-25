-- feat-2-032 2차 채점평/예시답안 전용 테이블. 한 문제에 여러 채점평(실제 채점위원 + 학원 강사)을
--   쌓을 수 있도록 problems 1:N. 예시답안(강사용)도 같은 행에 선택 저장.
--   RLS = problems 와 동일 정책(공개 읽기 + staff 쓰기) — 채점 기준 학습 자료로 노출.
create table if not exists public.problem_grading_notes (
  note_id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(problem_id) on delete cascade,
  -- 출처: examiner=실제 채점위원 채점평, instructor=학원 강사 채점평/첨삭
  source text not null default 'examiner'
    check (source in ('examiner', 'instructor')),
  author text,                 -- 출처/작성자 라벨(예 '실제 채점위원', 강사명)
  body_md text not null,       -- 채점평 본문(마크다운)
  example_answer_md text,      -- 예시답안(선택, 주로 강사)
  source_year int,             -- 원 채점평 회차 연도(참고)
  form text check (form in ('A', 'B') or form is null),  -- 책형(원 채점평이 폼 단위)
  display_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists problem_grading_notes_problem_idx
  on public.problem_grading_notes (problem_id, display_order);

alter table public.problem_grading_notes enable row level security;

drop policy if exists "read-grading-notes" on public.problem_grading_notes;
create policy "read-grading-notes"
  on public.problem_grading_notes for select
  using (true);

drop policy if exists "staff-write-grading-notes" on public.problem_grading_notes;
create policy "staff-write-grading-notes"
  on public.problem_grading_notes for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- updated_at 자동 갱신
create or replace function public.touch_problem_grading_notes()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_problem_grading_notes on public.problem_grading_notes;
create trigger trg_touch_problem_grading_notes
  before update on public.problem_grading_notes
  for each row execute function public.touch_problem_grading_notes();

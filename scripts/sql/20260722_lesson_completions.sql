-- feat-7-046 Stage 3 — 회원 CRM '개별완료처리' override.
-- LMS 완료 판정은 watch_events 파생(getLessonProgressForUser)이라 완료 컬럼이 없다.
-- 관리자가 특정 회원의 특정 회차를 수동으로 완료 처리할 수 있게 override 테이블을 둔다.
-- 완료 판정은 (시청 파생 완강) OR (이 override) 로 합쳐진다 — 항상 완료를 '추가'만 하므로 안전.

create table if not exists public.lesson_completions (
  lesson_id uuid not null references public.course_lessons(lesson_id) on delete cascade,
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  completed_by uuid references public.profiles(profile_id) on delete set null,
  completed_at timestamptz not null default now(),
  note text,
  primary key (lesson_id, user_id)
);

create index if not exists lesson_completions_user_idx
  on public.lesson_completions(user_id);

alter table public.lesson_completions enable row level security;

-- 본인 또는 staff 읽기(학생 수강 화면에도 수동 완료가 반영되도록).
drop policy if exists lesson_completions_select on public.lesson_completions;
create policy lesson_completions_select on public.lesson_completions
  for select
  using (user_id = auth.uid() or private.is_staff(auth.uid()));

-- 쓰기(완료 처리/취소)는 서버 권위(service_role = adminClient)만 — 별도 policy 없음.

-- feat-7-048 Stage E — 과목별 타이머 + 기록 방식 선택
-- 설계: docs/features/feat-7-048-cohort-ops-v2.md §4 M4 · D11
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_stage_e.sql
begin;

-- 1. 타이머로 만들어진 기록을 구분한다.
alter table public.study_logs drop constraint if exists study_logs_source_check;
alter table public.study_logs add constraint study_logs_source_check
  check (source in ('plan_check', 'manual', 'timer'));

-- 2. 타이머 세션 — 진행 중 상태가 필요해 원장(study_logs)과 분리한다.
--    ★세션 행은 UPDATE 가능하지만, 확정된 학습 기록은 여전히 append-only 다.
--    종료 시점에 study_logs 로 INSERT 되고 log_id 로 연결된다.
create table if not exists public.study_timer_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(profile_id) on delete cascade,
  plan_item_id  uuid references public.study_plan_items(item_id) on delete set null,
  node_id       uuid references public.systematic_nodes(node_id) on delete set null,
  subject_kind  text check (subject_kind in ('law', 'science', 'other')),
  subject_code  text,
  activity_type text not null check (activity_type in
    ('lecture', 'review', 'problem', 'memorize', 'reading', 'essay', 'other')),
  started_at    timestamptz not null,
  ended_at      timestamptz,
  -- 일시정지 누적(ms) + 정지 시작 시각(진행 중 정지면 non-null).
  paused_ms     integer not null default 0 check (paused_ms >= 0),
  paused_at     timestamptz,
  log_id        uuid references public.study_logs(log_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 동시에 두 과목을 공부할 수는 없다 — 진행 중 세션은 사용자당 1개.
create unique index if not exists study_timer_sessions_active_uniq
  on public.study_timer_sessions (user_id) where ended_at is null;
create index if not exists study_timer_sessions_user_idx
  on public.study_timer_sessions (user_id, started_at desc);

comment on table public.study_timer_sessions is
  '학습 타이머 세션 — 진행 중에는 UPDATE 가능. 종료 시 study_logs 로 확정(append-only 유지)';

alter table public.study_timer_sessions enable row level security;

drop policy if exists study_timer_sessions_own on public.study_timer_sessions;
create policy study_timer_sessions_own on public.study_timer_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists study_timer_sessions_staff_select on public.study_timer_sessions;
create policy study_timer_sessions_staff_select on public.study_timer_sessions for select
  to authenticated using (private.is_staff(auth.uid()));

-- 3. 기록 방식 — 호불호가 갈리는 요소라 학생이 고른다(원장 확정 §7-1).
create table if not exists public.student_study_prefs (
  user_id     uuid primary key references public.profiles(profile_id) on delete cascade,
  record_mode text not null default 'total' check (record_mode in ('timer', 'total')),
  updated_at  timestamptz not null default now()
);

alter table public.student_study_prefs enable row level security;

drop policy if exists student_study_prefs_own on public.student_study_prefs;
create policy student_study_prefs_own on public.student_study_prefs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists student_study_prefs_staff_select on public.student_study_prefs;
create policy student_study_prefs_staff_select on public.student_study_prefs for select
  to authenticated using (private.is_staff(auth.uid()));

commit;

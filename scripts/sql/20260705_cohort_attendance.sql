-- feat-7-043 — 출결 대장. 종합반 오프라인 수업 회차 + 학생별 출석 기록.

create table if not exists public.cohort_class_sessions (
  class_session_id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  session_no integer not null,
  held_on date not null,
  title text,
  note text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.cohort_class_sessions is '종합반 오프라인 수업 회차 — 출결 대장의 단위';

create index if not exists cohort_class_sessions_cohort_idx
  on public.cohort_class_sessions (cohort_id, session_no) where deleted_at is null;

create table if not exists public.cohort_attendance (
  attendance_id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.cohort_class_sessions(class_session_id) on delete cascade,
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  -- 출석 / 지각 / 결석 / 온라인 대체(VOD 인정) / 공결(사유 인정)
  status text not null check (status in ('present', 'late', 'absent', 'online', 'excused')),
  note text,
  recorded_by uuid references public.profiles(profile_id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (class_session_id, profile_id)
);

comment on table public.cohort_attendance is '회차별 학생 출석 기록 — 출석률은 조회 시 파생';

create index if not exists cohort_attendance_profile_idx
  on public.cohort_attendance (profile_id);

alter table public.cohort_class_sessions enable row level security;
alter table public.cohort_attendance enable row level security;

-- staff 전체 CRUD.
drop policy if exists cohort_class_sessions_staff_all on public.cohort_class_sessions;
create policy cohort_class_sessions_staff_all
  on public.cohort_class_sessions for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

drop policy if exists cohort_attendance_staff_all on public.cohort_attendance;
create policy cohort_attendance_staff_all
  on public.cohort_attendance for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- 학생: 자기 반 회차 read(맥락) + 자기 출석 read.
drop policy if exists cohort_class_sessions_select_member on public.cohort_class_sessions;
create policy cohort_class_sessions_select_member
  on public.cohort_class_sessions for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.cohort_members cm
      where cm.cohort_id = cohort_class_sessions.cohort_id
        and cm.profile_id = auth.uid()
    )
  );

drop policy if exists cohort_attendance_select_own on public.cohort_attendance;
create policy cohort_attendance_select_own
  on public.cohort_attendance for select
  to authenticated
  using (profile_id = auth.uid());

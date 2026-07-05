-- feat-7-044 — 오프라인 테스트 시리즈 (주간 테스트 1~N회 묶음 + 성적 추이).
-- 온·오프 병행 종합반 로드맵 P0-② — 시리즈로 묶어야 회차별 성장 곡선이 나온다.

create table if not exists public.offline_test_series (
  series_id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  title text not null,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.offline_test_series is '오프라인 테스트 시리즈 — 주간 테스트 등 회차 묶음(성적 추이 축)';

create index if not exists offline_test_series_cohort_idx
  on public.offline_test_series (cohort_id) where deleted_at is null;

alter table public.offline_tests
  add column if not exists series_id uuid references public.offline_test_series(series_id) on delete set null;
alter table public.offline_tests
  add column if not exists series_round_no integer;

create index if not exists offline_tests_series_idx
  on public.offline_tests (series_id, series_round_no) where deleted_at is null;

alter table public.offline_test_series enable row level security;

drop policy if exists offline_test_series_staff_all on public.offline_test_series;
create policy offline_test_series_staff_all
  on public.offline_test_series for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- 학생: 자기 반 시리즈 read (내 추이 카드 맥락).
drop policy if exists offline_test_series_select_member on public.offline_test_series;
create policy offline_test_series_select_member
  on public.offline_test_series for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.cohort_members cm
      where cm.cohort_id = offline_test_series.cohort_id
        and cm.profile_id = auth.uid()
    )
  );

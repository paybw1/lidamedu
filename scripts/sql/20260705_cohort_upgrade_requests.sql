-- 종합반 등업 신청 — 학생이 pricing 에서 신청 → 운영자가 반 배정으로 승인(등업).
-- 학생: 본인 신청 insert/select (RLS). 처리(승인/거절)는 운영자 adminClient 전용.

create table if not exists public.cohort_upgrade_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- 승인 시 배정된 반.
  cohort_id uuid references public.cohorts(cohort_id) on delete set null,
  admin_note text,
  processed_at timestamptz,
  processed_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.cohort_upgrade_requests is '종합반 등업 신청 대장 — 승인 = cohort_members 배정';

-- 사용자당 대기 중 신청 1건.
create unique index if not exists cohort_upgrade_requests_pending_uniq
  on public.cohort_upgrade_requests (user_id)
  where status = 'pending';
create index if not exists cohort_upgrade_requests_status_idx
  on public.cohort_upgrade_requests (status, created_at desc);

alter table public.cohort_upgrade_requests enable row level security;

drop policy if exists cohort_upgrade_requests_insert_own on public.cohort_upgrade_requests;
create policy cohort_upgrade_requests_insert_own
  on public.cohort_upgrade_requests for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists cohort_upgrade_requests_select_own on public.cohort_upgrade_requests;
create policy cohort_upgrade_requests_select_own
  on public.cohort_upgrade_requests for select
  to authenticated
  using (user_id = auth.uid());

-- 알림 kind — 신청(스태프용)·처리 결과(학생용).
alter type public.staff_notification_kind add value if not exists 'cohort_upgrade_requested';
alter type public.staff_notification_kind add value if not exists 'cohort_upgrade_processed';

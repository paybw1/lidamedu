-- feat-7-045 — 약점 개인 보충 과제. 과제에 개인 대상(target_profile_id) 도입.
-- null = 반 전체(기존과 동일), 값 있으면 그 학생 전용(약점 자동 생성이 주 사용처).

alter table public.assignments
  add column if not exists target_profile_id uuid
    references public.profiles(profile_id) on delete cascade;

create index if not exists assignments_target_idx
  on public.assignments (target_profile_id)
  where target_profile_id is not null;

comment on column public.assignments.target_profile_id is
  '개인 과제 대상 — null=반 전체. 약점 개인 보충 자동 생성(feat-7-045)이 주 사용처';

-- 반별 자동 생성 opt-in (주간 cron 대상 판별).
alter table public.cohorts
  add column if not exists weak_assignment_auto boolean not null default false;

-- ── RLS 재생성 — member read 에 개인 과제 필터 추가 ─────────────────────────
-- 원본 qual 에 (target_profile_id is null or = auth.uid()) 를 학생 경로에만 결합.
-- owner/manager 는 개인 과제 포함 전부 열람(운영 필요).

drop policy if exists assignments_member_read on public.assignments;
create policy assignments_member_read
  on public.assignments for select
  to authenticated
  using (
    deleted_at is null
    and (
      (
        user_is_in_cohort(cohort_id, auth.uid())
        and (target_profile_id is null or target_profile_id = auth.uid())
      )
      or user_owns_cohort(cohort_id, auth.uid())
      or private.is_manager(auth.uid())
    )
  );

drop policy if exists assignment_items_member_read on public.assignment_items;
create policy assignment_items_member_read
  on public.assignment_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.assignments a
      where a.assignment_id = assignment_items.assignment_id
        and a.deleted_at is null
        and (
          (
            user_is_in_cohort(a.cohort_id, auth.uid())
            and (a.target_profile_id is null or a.target_profile_id = auth.uid())
          )
          or user_owns_cohort(a.cohort_id, auth.uid())
          or private.is_manager(auth.uid())
        )
    )
  );

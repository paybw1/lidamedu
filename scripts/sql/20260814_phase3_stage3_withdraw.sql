-- Phase 3 Stage 3 — 제출 회수 경로 (Stage 2 승인 문서 §2).
-- 전이 추가: submitted → draft (학생 주체, reviewed_at IS NULL 조건).
-- 마찰이 상담자(반려 요청)가 아니라 학생 셀프 회수로 해소되도록 한다.
begin;

drop policy if exists study_plans_update_own on public.study_plans;
create policy study_plans_update_own on public.study_plans for update
  to authenticated
  using (
    user_id = auth.uid()
    and (
      status in ('draft', 'revision_requested')
      -- 회수 — 상담자가 아직 보지 않은(reviewed_at NULL) 제출본만.
      or (status = 'submitted' and reviewed_at is null)
    )
  )
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted', 'revision_requested')
    and exists (select 1 from public.cohort_members cm
                where cm.cohort_id = study_plans.cohort_id and cm.profile_id = auth.uid())
  );

commit;

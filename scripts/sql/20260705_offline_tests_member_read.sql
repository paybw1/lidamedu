-- feat-7-042 — 학생이 자기 반 오프라인 테스트의 제목/메타를 읽을 수 있게
-- (과제 상세의 "오프라인 테스트 결과" 카드용). 결과는 select_own 정책이 이미 있음.

drop policy if exists offline_tests_select_member on public.offline_tests;
create policy offline_tests_select_member
  on public.offline_tests for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.cohort_members cm
      where cm.cohort_id = offline_tests.cohort_id
        and cm.profile_id = auth.uid()
    )
  );

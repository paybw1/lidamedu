-- feat-7-042 온라인 응시 — 학생이 자기 반 테스트의 문항 구성(참조)을 읽을 수 있게.
-- 정답 자체는 이 테이블에 없음(문제·선지는 전체 공개 콘텐츠) — 노출 확대 없음.

drop policy if exists offline_test_questions_select_member on public.offline_test_questions;
create policy offline_test_questions_select_member
  on public.offline_test_questions for select
  to authenticated
  using (
    exists (
      select 1
      from public.offline_tests t
      join public.cohort_members cm on cm.cohort_id = t.cohort_id
      where t.test_id = offline_test_questions.test_id
        and t.deleted_at is null
        and cm.profile_id = auth.uid()
    )
  );

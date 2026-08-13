-- Phase 1 (feat-7-042 지필 마감) — T1(B안)·T2·S1 스키마.
-- 전제(적용 직전 재확인): offline_test_results 0행, 살아있는 시험지 0건.
begin;

-- ── T1(B안) — 문항별 정오 정규화 테이블 ─────────────────────────────────────
-- 정오 스냅샷 키를 ord → question_id(불변)로 전환. 문항 삭제·순서 변경에도
-- 스냅샷이 다른 문항을 가리키지 않는다(E4). wrong_ords 는 전환 기간 유지(코드
-- 미사용) 후 검증 통과 시 별도 마이그레이션으로 제거.
create table if not exists public.offline_test_answers (
  result_id uuid not null references public.offline_test_results(result_id) on delete cascade,
  question_id uuid not null references public.offline_test_questions(question_id) on delete cascade,
  is_correct boolean not null,
  primary key (result_id, question_id)
);
comment on table public.offline_test_answers is
  '오프라인 시험 문항별 정오 스냅샷 — 정오 원본은 세션 attempts. N2(선택답·부분점수)는 컬럼 추가로 확장';
create index if not exists offline_test_answers_question_idx
  on public.offline_test_answers (question_id);

alter table public.offline_test_answers enable row level security;

drop policy if exists offline_test_answers_staff_all on public.offline_test_answers;
create policy offline_test_answers_staff_all
  on public.offline_test_answers for all
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

-- 학생 읽기 — 부모 결과 행의 본인 소유를 경유 (승인 1-1).
drop policy if exists offline_test_answers_select_own on public.offline_test_answers;
create policy offline_test_answers_select_own
  on public.offline_test_answers for select
  to authenticated
  using (
    exists (
      select 1 from public.offline_test_results r
      where r.result_id = offline_test_answers.result_id
        and r.user_id = auth.uid()
    )
  );

-- ── T2 — 배포 게이트 ────────────────────────────────────────────────────────
-- 기존 행 전부 draft(의도 — 실사용 데이터 0 확인 후 적용).
alter table public.offline_tests
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz;
comment on column public.offline_tests.status is
  '배포 게이트 — draft(학생 비노출·편집 가능) / published(노출·문항 잠금·결과 입력) / closed(결과 열람만)';

-- ── S1 — SRS 축별 1회 적용 마커 (승인 1-3: 축별 분리 = 부분 실패 자가 치유) ──
-- 정책: SRS 는 성적이 아니라 복습 스케줄 — result 당 축별 1회 적용,
--   성적 정정·철회(taken→absent)에도 재적용/되돌림 없음.
alter table public.offline_test_results
  add column if not exists srs_problem_applied_at timestamptz,
  add column if not exists srs_ox_applied_at timestamptz;

-- ── 학생 SELECT RLS — 화이트리스트 (승인 1-2: 상태값 추가 시 기본 비노출) ────
-- staff 정책(*_staff_all)은 무변경.
drop policy if exists offline_tests_select_member on public.offline_tests;
create policy offline_tests_select_member
  on public.offline_tests for select
  to authenticated
  using (
    deleted_at is null
    and status in ('published', 'closed')
    and exists (
      select 1 from public.cohort_members cm
      where cm.cohort_id = offline_tests.cohort_id
        and cm.profile_id = auth.uid()
    )
  );

drop policy if exists offline_test_questions_select_member on public.offline_test_questions;
create policy offline_test_questions_select_member
  on public.offline_test_questions for select
  to authenticated
  using (
    exists (
      select 1 from public.offline_tests t
      join public.cohort_members cm on cm.cohort_id = t.cohort_id
      where t.test_id = offline_test_questions.test_id
        and t.deleted_at is null
        and t.status in ('published', 'closed')
        and cm.profile_id = auth.uid()
    )
  );

commit;

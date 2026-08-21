-- feat-7-048 Stage A — 진단(진입 시기) · 과목별 수준 드롭다운 · 반 차수
-- 설계: docs/features/feat-7-048-cohort-ops-v2.md §4 M1
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_stage_a.sql

-- 1. 진단 — 수험 진입 시기(년/월). 날짜 하나로 두지 않는 이유는 '일'에 의미가 없어서.
alter table public.student_diagnostics
  add column if not exists entry_year  smallint check (entry_year between 2000 and 2100),
  add column if not exists entry_month smallint check (entry_month between 1 and 12);

comment on column public.student_diagnostics.entry_year is
  '수험 진입 연도 — 수험 개월수는 저장하지 않고 (현재 연월 − 진입 연월)로 계산';

-- 2. 과목별 수준 — 수기 텍스트(completed_lectures/direction) 대신 드롭다운 2종.
--    kind(법/과학)별 허용 집합은 앱(labels.ts + zod)에서 강제한다 — CHECK 를 kind 조건부로
--    쓰면 값 추가 때마다 마이그레이션이 필요해진다.
alter table public.student_subject_status
  add column if not exists basic_course_status text
    check (basic_course_status in ('before', 'done', 'retake', 'not_needed')),
  add column if not exists study_direction text
    check (study_direction in ('advanced', 'objective', 'reading_problem', 'problem'));

comment on column public.student_subject_status.basic_course_status is
  '기본강의 수강여부 — before|done|retake (자연과학만 not_needed). 구 lecture_stage 를 대체';
comment on column public.student_subject_status.study_direction is
  '진행 방향 — 법: advanced|objective|reading_problem / 과학: advanced|objective|problem';

-- ★백필: 계획 빈 상태 폴백(listLevelBasedNodeSuggestions)의 대상 집합이 바뀌면 안 된다.
--   구 트리거 lecture_stage in ('none','basic') == 신 트리거 basic_course_status in ('before','retake').
update public.student_subject_status
   set basic_course_status =
         case when lecture_stage in ('none', 'basic') then 'before' else 'done' end
 where basic_course_status is null
   and lecture_stage is not null;

-- 3. 반 차수 — 1차 종합반은 민사소송법을 숨기고, 2차 종합반은 노출한다.
--    개인 단위 차수(profiles.next_exam_round)와 값 이름을 맞춘다.
alter table public.cohorts
  add column if not exists exam_round text not null default 'first'
    check (exam_round in ('first', 'second'));

comment on column public.cohorts.exam_round is
  '반의 대상 차수 — first|second. 계획·상담 화면의 법과목 목록이 이 값에서 파생된다';

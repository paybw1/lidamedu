-- 강의 캘린더 분류 축(원장 결정 2026-09-17): 일정에 「구분(1차/2차)」 칸 + 과목 코드 CHECK(SSOT 동기).
-- 원장 「진행 OK」(2026-09-17) → scripts/run-prod-sql.mjs → npm run db:typegen.
-- 전부 NULL 허용·기본 NULL = 현행 동작 그대로(구분 미지정은 「구분 없음」으로 표시, 필터에서 제외하지 않음).
-- 롤백: scripts/sql/20260917_schedule_exam_round_rollback.sql
begin;

-- ① 구분 — 1차(round1)/2차(round2). 값 이름은 상품 축 lecture_category(round1/round2)와 같은 어휘.
--    과목만으로는 못 정한다(특허법·상표법 등은 1·2차 모두) → 운영자가 폼에서 지정. 기존 6건은 NULL.
alter table public.lecture_schedules
  add column if not exists exam_round text;
alter table public.lecture_schedules drop constraint if exists lecture_schedules_exam_round_check;
alter table public.lecture_schedules
  add constraint lecture_schedules_exam_round_check
  check (exam_round is null or exam_round in ('round1', 'round2'));
comment on column public.lecture_schedules.exam_round is
  '강의 캘린더 구분 필터(2026-09-17): round1=1차, round2=2차, NULL=구분 없음. SSOT app/features/landing/lib/schedule-taxonomy.ts';

-- ② 과목 코드 CHECK — 캘린더 과목 필터 7종(LMS 과목 6 + 2차 선택 elective2). 운영 6건 전부 앞의 6값 안(2026-09-17 실측).
--    books_subject_code_check(6값)와 달리 elective2 를 더 허용한다 — 「2차 선택」은 일정·캘린더 전용 묶음.
alter table public.lecture_schedules drop constraint if exists lecture_schedules_subject_code_check;
alter table public.lecture_schedules
  add constraint lecture_schedules_subject_code_check
  check (subject_code is null or subject_code in ('patent', 'trademark', 'design', 'civil', 'civil-procedure', 'science', 'elective2'));

commit;

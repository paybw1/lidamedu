-- 롤백 — 20260917_schedule_exam_round.sql 을 되돌린다(구분 값은 사라진다 — 되돌리기 전에 exam_round 를 백업할 것).
begin;
alter table public.lecture_schedules drop constraint if exists lecture_schedules_subject_code_check;
alter table public.lecture_schedules drop constraint if exists lecture_schedules_exam_round_check;
alter table public.lecture_schedules drop column if exists exam_round;
commit;

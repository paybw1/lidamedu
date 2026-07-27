-- feat-11-007 #5 — 시리즈 삭제(수강생 없을 때만)를 위한 soft-delete 컬럼.
--   course_series 는 그동안 삭제 개념이 없었음. 에디션(courses)은 이미 deleted_at 보유.
alter table public.course_series
  add column if not exists deleted_at timestamptz;

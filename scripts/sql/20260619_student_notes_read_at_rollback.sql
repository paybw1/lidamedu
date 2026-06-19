-- 롤백: feat-7-025 B-1 읽음 표시 컬럼 제거.
alter table public.student_notes
  drop column if exists read_at;

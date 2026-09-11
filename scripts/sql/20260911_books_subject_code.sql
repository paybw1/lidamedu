-- 도서몰 과목별 구분(원장 요청 2026-09-11) — books.subject_code.
-- 값 집합은 강의개설(courses.subject_code)·강의그룹(content_groups.subject_code)과 같은 코드
-- (app/features/lms/lib/subject-options.ts 가 화면 SSOT). 1차/2차 구분(exam_round)은 원장 판단 보류 — 이 파일에 없다.
alter table public.books add column if not exists subject_code text;
alter table public.books drop constraint if exists books_subject_code_check;
alter table public.books add constraint books_subject_code_check
  check (
    subject_code is null
    or subject_code in ('patent', 'trademark', 'design', 'civil', 'civil-procedure', 'science')
  );

-- 초기 분류 — 제목으로 확정되는 것만(특허법·상표법). 나머지는 도서 수정 폼에서 지정한다.
update public.books
   set subject_code = 'patent'
 where subject_code is null and deleted_at is null and title like '%특허법%';
update public.books
   set subject_code = 'trademark'
 where subject_code is null and deleted_at is null and title like '%상표법%';

select coalesce(subject_code, '(미분류)') as subject_code, count(*) as books
  from public.books
 where deleted_at is null
 group by 1
 order by 1;

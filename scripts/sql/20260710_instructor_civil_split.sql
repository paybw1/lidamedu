-- feat-6-012 강사소개 — 계열 '민사법'(civil_law) 을 '민법'(civil) · '민사소송법'(civil_procedure) 로 분리.
-- 기존 civil_law 강사는 담당 과목 코드로 재분류(김동진=civil / 나지예·최범선=civil-procedure).
begin;

-- 1) 기존 체크 제약 해제(신규 값 허용 위해)
alter table public.instructors drop constraint if exists instructors_category_check;

-- 2) 데이터 재분류 — subject_codes 기준
update public.instructors
   set category = 'civil'
 where category = 'civil_law' and subject_codes @> array['civil']::text[];

update public.instructors
   set category = 'civil_procedure'
 where category = 'civil_law' and subject_codes @> array['civil-procedure']::text[];

-- 3) 남은 civil_law(코드 불명)은 민법으로 폴백
update public.instructors
   set category = 'civil'
 where category = 'civil_law';

-- 4) 신규 체크 제약 부여
alter table public.instructors
  add constraint instructors_category_check
  check (category in ('ip_law', 'civil', 'civil_procedure', 'science'));

commit;

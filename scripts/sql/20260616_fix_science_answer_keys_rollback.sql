-- 롤백 — 20260616_fix_science_answer_keys.sql 원복(공단 선지 false + 원래 선지 true).
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260616_fix_science_answer_keys_rollback.sql
begin;
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=11) and choice_index in (5,3);
update public.problem_choices set is_correct = (choice_index = 1)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=13) and choice_index in (1,5);
update public.problem_choices set is_correct = (choice_index = 1)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=14) and choice_index in (1,3);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=15) and choice_index in (3,2);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='biology' and problem_number=29) and choice_index in (3,5);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=31) and choice_index in (2,3);
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=33) and choice_index in (5,2);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=34) and choice_index in (3,2);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=37) and choice_index in (3,2);
update public.problem_choices set is_correct = (choice_index = 1)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=39) and choice_index in (1,3);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='chemistry' and problem_number=11) and choice_index in (3,1);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='chemistry' and problem_number=18) and choice_index in (2,5);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='biology' and problem_number=29) and choice_index in (3,4);
update public.problem_choices set is_correct = (choice_index = 4)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='biology' and problem_number=30) and choice_index in (4,5);
update public.problem_choices set is_correct = (choice_index = 4)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='earth_science' and problem_number=39) and choice_index in (4,5);
commit;

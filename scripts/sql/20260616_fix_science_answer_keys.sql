-- 자연과학 1차 기출 정답키 정정 — 공단 공식 정답 대조 확정 15건 (2026-06-16).
-- problem_choices.is_correct 만 변경(현재 선지 false + 공단 선지 true). 본문·해설·explanation_md 무변경.
-- dry-run + 사용자 승인 완료. 백업: tmp/jagwa/backup-is_correct-20260616.json. 롤백: _rollback 파일.
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260616_fix_science_answer_keys.sql
-- 정정불필요(공단=DB, 한빛 오류)는 제외: 2019 화학 q17·2024 화학 q17.

begin;

-- 2019 화학
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=11) and choice_index in (5,3);
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=13) and choice_index in (1,5);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=14) and choice_index in (1,3);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='chemistry' and problem_number=15) and choice_index in (3,2);

-- 2019 생물
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='biology' and problem_number=29) and choice_index in (3,5);

-- 2019 지학
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=31) and choice_index in (2,3);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=33) and choice_index in (5,2);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=34) and choice_index in (3,2);
update public.problem_choices set is_correct = (choice_index = 2)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=37) and choice_index in (3,2);
update public.problem_choices set is_correct = (choice_index = 3)
  where problem_id = (select problem_id from public.problems where year=2019 and science_subject='earth_science' and problem_number=39) and choice_index in (1,3);

-- 2022 화학 (q11 은 '미감사'였다가 공단 대조로 발견)
update public.problem_choices set is_correct = (choice_index = 1)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='chemistry' and problem_number=11) and choice_index in (3,1);
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='chemistry' and problem_number=18) and choice_index in (2,5);

-- 2022 생물
update public.problem_choices set is_correct = (choice_index = 4)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='biology' and problem_number=29) and choice_index in (3,4);
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='biology' and problem_number=30) and choice_index in (4,5);

-- 2022 지학
update public.problem_choices set is_correct = (choice_index = 5)
  where problem_id = (select problem_id from public.problems where year=2022 and science_subject='earth_science' and problem_number=39) and choice_index in (4,5);

commit;

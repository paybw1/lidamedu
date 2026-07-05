-- feat-7-042 확장 — 자연과학 시험지. 과목 = 법률(law_code) XOR 자연과학(science_subject).
-- 기존 행은 전부 law_code 보유라 새 check 를 즉시 만족한다.

alter table public.offline_tests
  alter column law_code drop not null;

alter table public.offline_tests
  add column if not exists science_subject text
    check (science_subject in ('physics', 'chemistry', 'biology', 'earth_science'));

alter table public.offline_tests
  drop constraint if exists offline_tests_subject_xor;
alter table public.offline_tests
  add constraint offline_tests_subject_xor
    check ((law_code is not null) <> (science_subject is not null));

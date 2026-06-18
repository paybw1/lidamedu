-- 롤백 — feat-2-025 ① next_exam_round 컬럼 DEFAULT 제거.
-- 기존 행은 영향 없음(DEFAULT 제거는 이후 신규 INSERT 의 기본값만 제거).
alter table public.profiles
  alter column next_exam_round drop default;

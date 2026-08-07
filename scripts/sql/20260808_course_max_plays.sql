-- feat-11-008 P6 — 강의(에디션) 단위 최대 재생횟수(원장 확정 2026-08-07).
-- null = 무제한. 기본 2회. 설정값은 소속 각 회차에 동일 적용(회차별 course_lessons.max_plays 는 쓰기 중단).
alter table public.courses add column if not exists max_plays integer default 2;
comment on column public.courses.max_plays is '강의 단위 최대 재생횟수(회차마다 각각 적용). null=무제한 (feat-11-008)';

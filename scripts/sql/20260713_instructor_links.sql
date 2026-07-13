-- 강사별 소통 채널(카페·블로그 등) — 라벨+URL 배열. 공개 프로필에 노출.
alter table public.instructors
  add column if not exists links jsonb not null default '[]'::jsonb;

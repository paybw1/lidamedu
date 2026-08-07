-- feat-11-008 P5 — 강의그룹 보강: 개설 강의(에디션) 연결 + 사용 여부.
alter table public.content_groups
  add column if not exists linked_course_id uuid references public.courses (course_id) on delete set null;
alter table public.content_groups
  add column if not exists is_active boolean not null default true;
comment on column public.content_groups.linked_course_id is '개설 강의(에디션) 연결 — 회차 가져오기 대상 (feat-11-008)';

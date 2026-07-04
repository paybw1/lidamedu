-- feat-7-041 강사관리 — 강사별 담당 과목(콘텐츠 작성·수정 권한 범위).
-- instructor 역할은 여기 지정된 과목만 콘텐츠 쓰기 가능(admin/manager 는 전 과목).
-- 미지정 강사 = 전 과목 쓰기 불가(안전 기본값). 정산은 instructor_share_rules(과목 규칙)와 연결.

create table if not exists public.instructor_subjects (
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  subject_code text not null,
  granted_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, subject_code)
);

alter table public.instructor_subjects enable row level security;
drop policy if exists instructor_subjects_read on public.instructor_subjects;
create policy instructor_subjects_read on public.instructor_subjects
  for select to authenticated using (true);

comment on table public.instructor_subjects is 'feat-7-041 강사 담당 과목 — instructor 콘텐츠 쓰기 권한 범위(쓰기는 운영자 화면/adminClient 전용)';

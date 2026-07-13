-- 시험정보(/lecture/exam-info) 편집형 승격 — 운영자가 /admin/exam-info 에서 직접 수정.
-- 콘텐츠 구조가 이질적(일정·과목·점수표·통계)이라 단일 JSONB 문서로 보관(CLAUDE.md: JSONB 유연 확장).
-- 공개 읽기, staff 편집. slug 로 향후 다중 페이지 확장 여지(현재 'default' 단일).
create table if not exists public.exam_info (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique default 'default',
  data        jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.exam_info;
create trigger set_updated_at before update on public.exam_info
  for each row execute function public.set_updated_at();

alter table public.exam_info enable row level security;
grant select on public.exam_info to anon, authenticated;
grant insert, update on public.exam_info to authenticated;

drop policy if exists exam_info_read on public.exam_info;
create policy exam_info_read on public.exam_info for select to anon, authenticated
  using (true);

drop policy if exists exam_info_write on public.exam_info;
create policy exam_info_write on public.exam_info for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

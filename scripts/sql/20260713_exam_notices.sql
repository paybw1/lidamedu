-- 시험 공고 게시판 — /lecture/exam-info 하단 "시험 공고" 섹션 + 운영자 첨부.
--   변리사 시험 시행계획·합격자 공고 등 공식 문서(PDF/HWP)를 staff 가 첨부, 누구나 열람·다운로드.
--   첨부는 exam_notices.attachments(jsonb 배열: {name,path,size}) — 별도 파일 테이블 없이 단순화.
--   공개 접근(anon 포함)이라 public 버킷 + getPublicUrl. 업로드는 adminClient(service_role).
create table if not exists public.exam_notices (
  notice_id     uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  body_md       text,
  attachments   jsonb not null default '[]'::jsonb,          -- [{name, path, size}]
  is_pinned     boolean not null default false,
  published     boolean not null default true,
  published_at  timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists exam_notices_public_idx
  on public.exam_notices (is_pinned desc, published_at desc)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.exam_notices;
create trigger set_updated_at before update on public.exam_notices
  for each row execute function public.set_updated_at();

alter table public.exam_notices enable row level security;
grant select on public.exam_notices to anon, authenticated;
grant insert, update on public.exam_notices to authenticated;

drop policy if exists exam_notices_read on public.exam_notices;
create policy exam_notices_read on public.exam_notices for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));
drop policy if exists exam_notices_write on public.exam_notices;
create policy exam_notices_write on public.exam_notices for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- 공개 버킷(URL 로 열람). 업로드는 service_role 이라 storage.objects 정책 불필요.
insert into storage.buckets (id, name, public, file_size_limit)
values ('exam-notices', 'exam-notices', true, 20971520)
on conflict (id) do nothing;

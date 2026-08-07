-- feat-11-008 P2 — 페이지관리(풀페이지 CMS): 이벤트·T-PASS 소개·패키지 소개 등 운영자 제작 페이지.
-- custom_pages(코드 기반 URL /page/:code) + custom_page_revisions(변경 이력).

create table if not exists public.custom_pages (
  page_id uuid primary key default gen_random_uuid(),
  title text not null,
  code text not null,
  body_html text not null default '',
  status text not null default 'stopped' check (status in ('use', 'stopped')),
  admin_memo text,
  created_by uuid references public.profiles (profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.custom_pages is '운영자 제작 풀페이지(이벤트·소개) — /page/:code (feat-11-008)';

-- 코드는 삭제되지 않은 페이지 간 유일(대소문자 무시) — URL 식별자.
create unique index if not exists custom_pages_code_key
  on public.custom_pages (lower(code))
  where deleted_at is null;

create table if not exists public.custom_page_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.custom_pages (page_id) on delete cascade,
  title text not null,
  body_html text not null,
  status text not null,
  edited_by uuid,
  edited_at timestamptz not null default now()
);
comment on table public.custom_page_revisions is '페이지 변경 전 스냅샷(제목·본문·상태·수정자) (feat-11-008)';
create index if not exists custom_page_revisions_page_idx
  on public.custom_page_revisions (page_id, edited_at desc);

alter table public.custom_pages enable row level security;
alter table public.custom_page_revisions enable row level security;

-- 공개 읽기: 사용 상태만. staff 는 중지 페이지도 열람(미리보기).
drop policy if exists custom_pages_select on public.custom_pages;
create policy custom_pages_select on public.custom_pages
  for select using (
    deleted_at is null
    and (status = 'use' or private.is_staff(auth.uid()))
  );
-- 쓰기: staff.
drop policy if exists custom_pages_write on public.custom_pages;
create policy custom_pages_write on public.custom_pages
  for all using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

drop policy if exists custom_page_revisions_select on public.custom_page_revisions;
create policy custom_page_revisions_select on public.custom_page_revisions
  for select using (private.is_staff(auth.uid()));
drop policy if exists custom_page_revisions_write on public.custom_page_revisions;
create policy custom_page_revisions_write on public.custom_page_revisions
  for insert with check (private.is_staff(auth.uid()));

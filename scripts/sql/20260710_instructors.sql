-- feat-6-012 강사소개(리담안내) — 강사 프로필 테이블 + RLS + 사진 버킷.
-- 공개 읽기(published), staff 편집. 사진 업로드는 adminClient(service_role) → storage 정책 불필요.
create table if not exists public.instructors (
  instructor_id uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name          text not null check (length(name) between 1 and 40),
  monogram      text,                                    -- 한자/이니셜 자리표시자(사진 없을 때)
  category      text not null default 'ip_law'
                  check (category in ('ip_law', 'civil_law', 'science')),
  subject_label text not null,                           -- 표시용 "상표법 · 디자인보호법"
  subject_codes text[] not null default '{}',            -- 강의/과목 연동용 slug
  title         text,                                    -- 직책 "특허법인 리담 대표변리사"
  role_label    text,                                    -- "특허법 전임"
  headline      text,                                    -- 히어로 명제(한 줄)
  photo_path    text,                                    -- 업로드 사진 URL(null=모노그램)
  metrics       jsonb not null default '[]'::jsonb,      -- [{value,unit,label}] 신뢰 지표
  education     jsonb not null default '[]'::jsonb,      -- [string] 학력
  career        jsonb not null default '[]'::jsonb,      -- [string] 경력
  books         jsonb not null default '[]'::jsonb,      -- [{title,label}] 저서
  philosophy_md text,                                    -- 강의 철학
  bio_md        text,                                    -- 추가 소개(선택)
  profile_id    uuid references public.profiles (profile_id) on delete set null,
  display_order int not null default 0,
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists instructors_public_idx
  on public.instructors (category, display_order) where deleted_at is null and published;

drop trigger if exists set_updated_at on public.instructors;
create trigger set_updated_at before update on public.instructors
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.instructors enable row level security;
grant select on public.instructors to anon, authenticated;
grant insert, update on public.instructors to authenticated;

-- 공개 읽기: 게시(published)된 강사는 누구나. staff 는 미게시 포함 전체.
drop policy if exists instructors_read on public.instructors;
create policy instructors_read on public.instructors for select to anon, authenticated
  using (deleted_at is null
    and (published or private.is_staff((select auth.uid()))));
drop policy if exists instructors_write on public.instructors;
create policy instructors_write on public.instructors for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- ── 사진 버킷(공개 읽기, 업로드는 service_role) ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('instructor-photos', 'instructor-photos', true)
on conflict (id) do nothing;

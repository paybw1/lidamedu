-- ============================================================
-- 회원가입을 위한 profiles 테이블 + 역할 enum + RLS + 자동 생성 트리거
-- 도메인: 변리사 학습 플랫폼 (student / instructor / admin)
-- 적용: Supabase MCP apply_migration (이름: create_profiles_for_signup)
-- ============================================================

-- 역할 enum
create type public.user_role as enum ('student', 'instructor', 'admin');

-- profiles 테이블
create table public.profiles (
  profile_id          uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  avatar_url          text,
  role                public.user_role not null default 'student',
  marketing_consent   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로필 (auth.users 1:1 확장)';
comment on column public.profiles.role is '학습 플랫폼 역할: student / instructor / admin';

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;

create policy "select-own-profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "update-own-profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy "delete-own-profile"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- ============================================================
-- 신규 가입 시 profiles 자동 생성
-- auth.users.raw_user_meta_data 에서 name, marketing_consent 추출
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (profile_id, name, marketing_consent)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

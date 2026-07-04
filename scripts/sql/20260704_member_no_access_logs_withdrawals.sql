-- 수강생 운영 3종 (사용자 요청 2026-07-04)
-- ① profiles.member_no — 영구 회원번호(가입순 시퀀스, 표시용)
-- ② user_access_logs — 접속(로그인) 이력
-- ③ user_withdrawals — 탈퇴 관리 대장 (auth 삭제 후에도 남도록 이름·아이디 스냅샷)

-- ① 회원번호
create sequence if not exists profiles_member_no_seq;
alter table public.profiles
  add column if not exists member_no integer unique;
-- 기존 회원 backfill — 가입순.
with ordered as (
  select profile_id, row_number() over (order by created_at asc, profile_id) as rn
  from public.profiles
  where member_no is null
)
update public.profiles p
set member_no = ordered.rn + coalesce((select max(member_no) from public.profiles), 0)
from ordered
where p.profile_id = ordered.profile_id;
select setval('profiles_member_no_seq', coalesce((select max(member_no) from public.profiles), 0) + 1, false);
alter table public.profiles
  alter column member_no set default nextval('profiles_member_no_seq');

-- ② 접속 이력 — 로그인 완주 시 기록. RLS enable + 정책 없음(운영자 adminClient 전용).
create table if not exists public.user_access_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(profile_id) on delete set null,
  kind text not null default 'login' check (kind in ('login')),
  client text, -- 접속단: 'PC' | '모바일' (User-Agent 파생)
  browser text,
  device text, -- OS/기기
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists user_access_logs_user_idx on public.user_access_logs (user_id, created_at desc);
create index if not exists user_access_logs_created_idx on public.user_access_logs (created_at desc);
alter table public.user_access_logs enable row level security;

-- ③ 탈퇴 관리 — status: withdrawn(탈퇴 처리, 계정 잠금) → deleted(auth 계정 삭제 완료).
create table if not exists public.user_withdrawals (
  withdrawal_id uuid primary key default gen_random_uuid(),
  user_id uuid, -- auth 삭제 후 NULL 참조 대신 스냅샷 유지 (FK 없음)
  member_no integer,
  user_name text,
  user_login_id text, -- 회원아이디(이메일)
  status text not null default 'withdrawn' check (status in ('withdrawn', 'deleted')),
  withdrawn_at timestamptz not null default now(), -- 탈퇴일
  withdrawn_by uuid references public.profiles(profile_id) on delete set null,
  deleted_at timestamptz, -- 계정 삭제일
  deleted_by uuid references public.profiles(profile_id) on delete set null, -- 삭제처리자
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists user_withdrawals_status_idx on public.user_withdrawals (status, withdrawn_at desc);
alter table public.user_withdrawals enable row level security;

comment on column public.profiles.member_no is '영구 회원번호(가입순) — 표시·조회용';
comment on table public.user_access_logs is '접속(로그인) 이력 — 카카오 로그인 완주 시 기록';
comment on table public.user_withdrawals is '탈퇴 관리 대장 — 스냅샷 보존(회원 삭제 후에도 행 유지)';

-- 세그먼트 대량 메시징(broadcast) 로그 — 운영자 발송 이력·감사.
-- RLS enable + 정책 없음: 접근은 전부 adminClient(service_role, manager+ loader 게이트) 경유.
create table if not exists public.broadcasts (
  broadcast_id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(profile_id) on delete set null,
  segment_key text not null,
  segment_label text not null,
  title text not null,
  body_md text not null default '',
  channels text[] not null default '{}',
  recipient_count integer not null default 0,
  email_sent integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
create index if not exists idx_broadcasts_created on public.broadcasts (created_at desc);

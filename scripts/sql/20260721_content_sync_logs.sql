-- feat-11-006 Phase 1 잔여 — 콜러스 콘텐츠 동기화 이력/오류 로그
-- 설계: docs/features/강의플랫폼-추가설계-방향.md §3 Phase 1 "동기화 job(+동기화 오류 로그)"
-- 성격: append-only 로그. 매 동기화(cron/manual) 결과·오류를 1행 기록 → 운영자 진단.
begin;

create table if not exists public.content_sync_logs (
  log_id        uuid primary key default gen_random_uuid(),
  source        text not null default 'manual',   -- cron / manual
  triggered_by  uuid references public.profiles(profile_id),  -- 수동 실행자(cron=null)
  status        text not null default 'success',  -- success / partial / error / skipped
  fetched       int not null default 0,           -- 콜러스에서 받은 콘텐츠 수
  inserted      int not null default 0,
  updated       int not null default 0,
  skipped       int not null default 0,
  error_count   int not null default 0,
  errors        jsonb not null default '[]'::jsonb, -- 오류 메시지 배열
  duration_ms   int,                              -- 소요 시간(ms)
  created_at    timestamptz not null default now()
);
create index if not exists content_sync_logs_created_idx
  on public.content_sync_logs(created_at desc);

-- RLS: 콘텐츠 키·동기화 내부정보 → staff 전용 조회. 쓰기는 service_role(cron/action)만.
alter table public.content_sync_logs enable row level security;

drop policy if exists content_sync_logs_read_staff on public.content_sync_logs;
create policy content_sync_logs_read_staff on public.content_sync_logs for select
  using (private.is_staff((select auth.uid())));

commit;

select count(*) as sync_logs from public.content_sync_logs;

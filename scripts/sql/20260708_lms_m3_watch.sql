-- feat-11-003 — M3 시청 기록·배수 회계·기기 (설계 §3.6·3.7·§4, M1 승인 2026-07-08)
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260708_lms_m3_watch.sql → npm run db:typegen
-- 원칙: watch_events/watch_ledger = append-only(서버만 INSERT, UPDATE/DELETE 금지),
--       잔여 배수 = 파생(v_enrollment_watch_balance). ★watch_events 는 환불 기준·회계 근거라
--       영구 보존 — 법적 근거는 개인정보처리방침 반영(M1 승인 단서 2, 정식 판매 전 법무 항목).

-- ─────────────────────────────────────────────────────────────
-- 1) 시청 구간 보고 원본 (§3.6)
-- ─────────────────────────────────────────────────────────────

create table public.watch_events (
  event_id bigint generated always as identity primary key,
  grant_id uuid not null references public.playback_grants (grant_id) on delete restrict,
  user_id uuid references public.profiles (profile_id) on delete set null, -- null=비로그인 맛보기·탈퇴 후 보존
  enrollment_id uuid references public.enrollments (enrollment_id) on delete set null, -- null=맛보기·무료(차감 예외)
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete restrict,
  video_id uuid not null references public.lesson_videos (video_id) on delete restrict,
  from_seconds int not null check (from_seconds >= 0),
  to_seconds int not null,
  reported_at timestamptz not null default now(),
  client_seq int not null check (client_seq >= 0),
  check (to_seconds > from_seconds),
  unique (grant_id, client_seq)                    -- 멱등 키 — 재전송 중복 차감 방지
);
create index watch_events_user_lesson_idx on public.watch_events (user_id, lesson_id);
create index watch_events_enrollment_idx on public.watch_events (enrollment_id);
create index watch_events_reported_idx on public.watch_events (reported_at);

-- 이어보기 (upsert 상태)
create table public.watch_positions (
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete cascade,
  video_id uuid not null references public.lesson_videos (video_id) on delete cascade,
  position_seconds int not null default 0 check (position_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ─────────────────────────────────────────────────────────────
-- 2) 배수 회계 원장 (§4.2) — append-only
-- ─────────────────────────────────────────────────────────────

create table public.watch_ledger (
  ledger_id bigint generated always as identity primary key,
  enrollment_id uuid not null references public.enrollments (enrollment_id) on delete restrict,
  lesson_id uuid references public.course_lessons (lesson_id) on delete set null,
  video_id uuid references public.lesson_videos (video_id) on delete set null,
  kind text not null check (kind in ('debit','credit','adjust','reset')),
  seconds int not null check (seconds <> 0),        -- debit 양수 / credit·reset 음수 관례(SUM=사용량)
  source_event_id bigint references public.watch_events (event_id) on delete set null,
  reason text,
  actor_id uuid references public.profiles (profile_id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'debit' or reason is not null)      -- credit/adjust/reset 은 사유 필수
);
create index watch_ledger_enrollment_idx on public.watch_ledger (enrollment_id);

-- 잔여 파생 뷰 — security_invoker: 밑단 RLS(본인+staff)가 그대로 적용
create view public.v_enrollment_watch_balance
with (security_invoker = true) as
select
  e.enrollment_id,
  e.user_id,
  e.course_id,
  e.base_duration_snapshot_seconds,
  e.multiplier_snapshot,
  case when e.multiplier_snapshot is null then null
       else floor(e.base_duration_snapshot_seconds * e.multiplier_snapshot)::int end as allowed_seconds,
  coalesce((select sum(l.seconds) from public.watch_ledger l where l.enrollment_id = e.enrollment_id), 0)::int as used_seconds,
  case when e.multiplier_snapshot is null then null
       else (floor(e.base_duration_snapshot_seconds * e.multiplier_snapshot)
             - coalesce((select sum(l.seconds) from public.watch_ledger l where l.enrollment_id = e.enrollment_id), 0))::int end as remaining_seconds
from public.enrollments e;

-- ─────────────────────────────────────────────────────────────
-- 3) 기기 관리 (§3.7)
-- ─────────────────────────────────────────────────────────────

create table public.user_devices (
  device_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  kind text not null check (kind in ('pc','mobile','tablet')),
  device_fingerprint text,                   -- [벤더] DRM 플레이어 기기 ID — 확정 전 null 허용
  device_name text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text check (revoked_by in ('self','admin','auto'))
);
create index user_devices_user_idx on public.user_devices (user_id);
create unique index user_devices_active_fp on public.user_devices (user_id, device_fingerprint)
  where revoked_at is null and device_fingerprint is not null;

create table public.device_reset_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  device_id uuid references public.user_devices (device_id) on delete set null,
  actor_id uuid references public.profiles (profile_id) on delete set null, -- 본인/관리자
  reason text not null,
  created_at timestamptz not null default now()
);
create index device_reset_logs_user_idx on public.device_reset_logs (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 4) RLS — 이벤트·원장은 서버만 쓰기, 본인+staff 읽기
-- ─────────────────────────────────────────────────────────────

alter table public.watch_events enable row level security;
alter table public.watch_positions enable row level security;
alter table public.watch_ledger enable row level security;
alter table public.user_devices enable row level security;
alter table public.device_reset_logs enable row level security;

create policy watch_events_select_own_or_staff on public.watch_events
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
create policy watch_positions_select_own_or_staff on public.watch_positions
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
create policy watch_ledger_select_own_or_staff on public.watch_ledger
  for select using (
    exists (select 1 from public.enrollments e
            where e.enrollment_id = watch_ledger.enrollment_id
              and e.user_id = (select auth.uid()))
    or private.is_staff((select auth.uid()))
  );
create policy user_devices_select_own_or_staff on public.user_devices
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
create policy device_reset_logs_select_own_or_staff on public.device_reset_logs
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
-- INSERT/UPDATE 정책 없음 — 전부 서버(service_role) 경유. append-only 는 서버 코드 규약
-- (service_role 은 RLS 미적용이라 DB 강제 불가 — UPDATE/DELETE 경로를 만들지 않는 것으로 동결).

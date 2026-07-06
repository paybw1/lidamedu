-- 토스 웹훅 수신 이벤트 로그 — 미수신/처리 실패 진단용(운영 감사).
-- 쓰기 = 서버(service_role)만, 읽기 = staff.

create table if not exists public.payment_webhook_events (
  event_id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event_type text,
  toss_order_id text,
  payment_id uuid references public.payments(payment_id),
  -- processed(반영) | ignored(무관/변경없음) | error(재시도 대상)
  outcome text not null,
  detail text,
  raw jsonb
);

create index if not exists payment_webhook_events_order_idx
  on public.payment_webhook_events (toss_order_id);
create index if not exists payment_webhook_events_received_idx
  on public.payment_webhook_events (received_at desc);

alter table public.payment_webhook_events enable row level security;

drop policy if exists payment_webhook_events_staff_read on public.payment_webhook_events;
create policy payment_webhook_events_staff_read on public.payment_webhook_events
  for select using (private.is_staff(auth.uid()));

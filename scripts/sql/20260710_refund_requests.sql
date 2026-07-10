-- feat-8-029 P3 — 사용자 개시 환불요청 워크플로.
-- 학생이 결제 완료 항목에 대해 환불을 요청 → 운영자 승인(refundOrderItem 실행)/거절.

create table if not exists public.refund_requests (
  refund_request_id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(order_item_id) on delete cascade,
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references public.profiles(profile_id),
  resolved_at timestamptz,
  resolve_note text,
  refunded_krw integer,
  created_at timestamptz not null default now()
);

-- 항목당 대기중 요청은 하나만(중복 요청 방지).
create unique index if not exists refund_requests_one_pending
  on public.refund_requests (order_item_id)
  where status = 'pending';
create index if not exists refund_requests_status_idx
  on public.refund_requests (status, created_at);
create index if not exists refund_requests_user_idx
  on public.refund_requests (user_id, created_at desc);

alter table public.refund_requests enable row level security;

-- 학생: 본인 요청만 생성. (order_item 소유권은 서버 액션에서 추가 검증)
drop policy if exists refund_requests_insert_own on public.refund_requests;
create policy refund_requests_insert_own on public.refund_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- 조회: 본인 요청 또는 staff. (운영자 승인/거절 UPDATE 는 service_role 로만 수행)
drop policy if exists refund_requests_select_own_or_staff on public.refund_requests;
create policy refund_requests_select_own_or_staff on public.refund_requests
  for select to authenticated
  using (user_id = auth.uid() or private.is_staff(auth.uid()));

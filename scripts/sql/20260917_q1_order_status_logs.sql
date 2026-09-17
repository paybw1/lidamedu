-- feat-11-014 Q1 — 주문관리 상태 변경 셀렉트의 이력 표 + 「보관」 플래그 (260917 요청서 · 원장 결정 A1·A2).
-- ★적용 금지(설계 단계). 원장 승인 = 하드스톱 → scripts/run-prod-sql.mjs → npm run db:typegen.
--   소비 코드(셀렉트 액션·목록 필터·이력 펼침)는 이 DDL 이 운영에 적용된 뒤에 작성한다 —
--   먼저 배포되면 없는 표·컬럼을 select 해 런타임에서 깨진다.
--
-- 둘 다 현행 동작 무변경: archived_at 기본 NULL(= 목록에 그대로 보임), 이력 표는 빈 표.
-- ★이력은 트리거가 아니라 서버 액션이 adminClient 로 직접 insert 한다 —
--   refund_status_logs 의 GUC(app.refund_actor) 방식은 service_role 쓰기에서 actor 가 비는 함정이 있어 반복하지 않는다.
-- 롤백: scripts/sql/20260917_q1_order_status_logs_rollback.sql
begin;

-- ① 주문 상태 변경 이력 — 관리자 셀렉트 5값(입금대기·결제완료·취소·환불완료·보관)의 전/후·사유·처리자.
--    append-only. 보관(archive)은 status 전이가 아니지만 같은 표에 to_status='archived' 로 남긴다(원장이 한 표에서 본다).
create table if not exists public.order_status_logs (
  log_id       uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(order_id) on delete cascade,
  from_status  text,
  to_status    text not null,
  reason       text not null,
  actor_id     uuid references public.profiles(profile_id),
  created_at   timestamptz not null default now()
);
create index if not exists order_status_logs_order_idx
  on public.order_status_logs (order_id, created_at desc);

comment on table public.order_status_logs is
  'feat-11-014 Q1 주문 상태 변경 이력(관리자 셀렉트). append-only — 변경일시·처리관리자·전/후·사유(요청서 「변경 이력」). 서버 액션이 직접 insert.';

alter table public.order_status_logs enable row level security;
drop policy if exists order_status_logs_select_staff on public.order_status_logs;
create policy order_status_logs_select_staff on public.order_status_logs
  for select to authenticated using (private.is_staff((select auth.uid())));

-- ② 보관 플래그 — 「삭제」 대신(원장 결정 A2). 결제 전 상태(draft/attempted/pending_payment/expired/cancelled/failed)만 서버가 허용.
--    NULL = 목록에 보임. 값 있음 = 기본 목록에서 숨기고 「보관함」 필터로 열람. 행·FK·통계 무변경.
alter table public.orders add column if not exists archived_at timestamptz;
create index if not exists orders_archived_at_idx
  on public.orders (archived_at) where archived_at is not null;

comment on column public.orders.archived_at is
  'feat-11-014 A2 보관(목록 숨김). 결제·환불 주문은 서버가 거부. 삭제가 아니다 — 주문·결제·포인트 기록은 그대로.';

commit;

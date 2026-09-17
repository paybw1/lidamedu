-- feat-11-014 Q1 롤백 — 20260917_q1_order_status_logs.sql 을 되돌린다.
-- ★이력 표를 지우면 그때까지의 상태 변경 근거가 사라진다 — 되돌리기 전에 audit_logs 미러가 남아 있는지 확인.
begin;

drop index if exists public.orders_archived_at_idx;
alter table public.orders drop column if exists archived_at;

drop policy if exists order_status_logs_select_staff on public.order_status_logs;
drop index if exists public.order_status_logs_order_idx;
drop table if exists public.order_status_logs;

commit;

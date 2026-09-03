-- 원복 — 'refund' 로그가 남아 있으면 제약 복원이 실패하므로 먼저 확인할 것.
--   select count(*) from subscription_admin_logs where action = 'refund';
alter table public.subscription_admin_logs
  drop constraint if exists subscription_admin_logs_action_check;

alter table public.subscription_admin_logs
  add constraint subscription_admin_logs_action_check
  check (action = any (array['grant', 'extend', 'cancel', 'auto_cancel']));

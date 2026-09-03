-- feat-11-011 — 운영자 결제 환불(취소) 기능.
-- subscription_admin_logs.action 에 'refund' 를 추가한다. 환불은 돈이 나가는 조작이므로
-- 기존 지급·연장·취소와 같은 감사 원장에 남긴다(별도 테이블을 만들지 않는다).
alter table public.subscription_admin_logs
  drop constraint if exists subscription_admin_logs_action_check;

alter table public.subscription_admin_logs
  add constraint subscription_admin_logs_action_check
  check (action = any (array['grant', 'extend', 'cancel', 'auto_cancel', 'refund']));

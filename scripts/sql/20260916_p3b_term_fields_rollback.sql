-- feat-11-013 P3-b 롤백 — 20260916_p3b_term_fields.sql 의 역순. 컬럼은 전부 NULL 허용이라 데이터 이관 없음.
begin;
alter table subscription_plans drop constraint if exists subscription_plans_available_window_check;
alter table subscription_plans drop column if exists available_until;

alter table plan_policies drop constraint if exists plan_policies_mid_entry_days_required_check;
alter table plan_policies drop constraint if exists plan_policies_mid_entry_days_check;
alter table plan_policies drop constraint if exists plan_policies_mid_entry_mode_check;
alter table plan_policies drop column if exists mid_entry_days;
alter table plan_policies drop column if exists mid_entry_mode;
alter table plan_policies drop column if exists starts_on;
commit;

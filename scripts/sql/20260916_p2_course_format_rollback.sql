begin;
alter table subscription_plans drop constraint if exists subscription_plans_course_format_kind_check;
alter table subscription_plans drop constraint if exists subscription_plans_course_format_check;
drop index if exists subscription_plans_course_format_idx;
alter table subscription_plans drop column if exists course_format;
commit;

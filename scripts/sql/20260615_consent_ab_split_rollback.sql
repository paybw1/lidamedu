-- 롤백: 20260615_consent_ab_split.sql
alter table profiles
  drop column if exists my_analysis_consent_at,
  drop column if exists pool_consent_at;

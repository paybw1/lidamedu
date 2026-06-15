-- feat-8-026b 동의 A/B 분리 — 1단계: 컬럼 신설 (백필 없음).
-- A(my_analysis): 내 데이터로 내 분석(학습통계·OX진단·복습·암기). 기본 null=미동의.
-- B(pool): 풀 기여 ↔ 비교 열람(대칭) + 합격자/공개/후기 기여. 기본 null=미동의.
-- analytics_consent_at(현행)은 전환기 병행 유지 — 2~5단계 완료 후 별도 마이그로 제거.
-- 백필 없음(기존 7명은 테스트 계정, reset 예정). RLS 변경 없음(profiles 기존 정책이 모든 컬럼 커버).
-- 롤백: scripts/sql/20260615_consent_ab_split_rollback.sql

alter table profiles
  add column if not exists my_analysis_consent_at timestamptz,
  add column if not exists pool_consent_at timestamptz;

comment on column profiles.my_analysis_consent_at is
  'A 동의(feat-8-026b): 내 데이터로 내 분석(학습통계·OX진단·복습·암기) 동의 시각. null=미동의. 철회 시 해당 기능 off.';
comment on column profiles.pool_consent_at is
  'B 동의(feat-8-026b): 풀 기여↔합격자·동료 비교 열람(대칭) + 합격자패턴·공개통계·후기 기여 동의 시각. null=미동의.';

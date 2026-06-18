-- feat-7-021b ④ — 과제 마감 정책 3유형. 추가형(무해): 기존 행은 DEFAULT 로 자동 'recommended'
-- 백필 = 현행 동작(마감 후도 완료 인정)과 동일.
--   recommended  : 마감 후에도 완료 인정, 표시 없음(현행).
--   late_allowed : 마감 후에도 완료 인정 + "지각 완료" 배지(완료가 마감 이후일 때).
--   strict       : 마감 후 완료 불인정 — 미완 유지(학습 자체는 무차단).
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260619_assignment_deadline_policy.sql
-- 롤백: scripts/sql/20260619_assignment_deadline_policy_rollback.sql
do $$ begin
  if not exists (select 1 from pg_type where typname = 'deadline_policy') then
    create type public.deadline_policy as enum ('recommended', 'late_allowed', 'strict');
  end if;
end $$;

alter table public.assignments
  add column if not exists deadline_policy public.deadline_policy not null default 'recommended';

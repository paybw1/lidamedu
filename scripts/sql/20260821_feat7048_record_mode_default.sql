-- feat-7-048 — 기록 방식 기본값을 타이머로(원장 요청 2026-08-21).
-- 이미 직접 고른 학생의 값은 건드리지 않는다(행이 있으면 그 값이 우선).
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_record_mode_default.sql
alter table public.student_study_prefs alter column record_mode set default 'timer';

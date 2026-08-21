-- feat-7-048 Stage B — 학생 알림 kind 추가(상담자가 계획을 수정함).
-- ★kinds.ts STUDENT_KINDS 에도 등록해야 인박스 필터에 잡힌다.
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_notif_kind.sql
alter type public.staff_notification_kind add value if not exists 'study_plan_updated_by_staff';

-- feat-2-025 Phase 2 — study_goals.exam_type 제거(차수 SSOT = profiles.next_exam_round).
--
-- 선행 조건: Phase 1 코드(커밋 465dbf7)가 운영 배포되어 더는 exam_type 를 읽지/쓰지 않음
--   (getStudyGoals select·upsertStudyGoals·온보딩에서 제거 완료).
-- dry-run(2026-06-18, 운영 mcgdoplo, ② 발산 행 기준):
--   exam_type='second' 0행 → 데이터 이전(백필) 불필요(no-op). 전 8행 'first'/write-only.
--   차수 권위는 profiles.next_exam_round 로 이전 완료. 2차 1행은 Phase 1 이 자동 교정(profiles='second').
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260618_drop_study_goals_exam_type.sql
-- 롤백: scripts/sql/20260618_drop_study_goals_exam_type_rollback.sql
alter table public.study_goals drop column exam_type;

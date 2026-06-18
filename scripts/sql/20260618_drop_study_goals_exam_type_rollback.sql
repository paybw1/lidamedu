-- 롤백 — feat-2-025 Phase 2. study_goals.exam_type 컬럼 복구.
-- 원본 데이터는 복구 불가하나, dry-run 상 전 행 'first'(write-only)였으므로 기본값
-- 재생성으로 의미 동일. 차수 권위는 profiles.next_exam_round 이며 코드는 이 컬럼을
-- 읽지 않으므로(Phase 1) 복구 후에도 사용되지 않는다(스키마 원복 용도).
alter table public.study_goals add column exam_type text not null default 'first';

-- feat-2-025 ① — 신규 유저 차수(next_exam_round) SSOT 보장.
-- 라이브 트리거 handle_new_user 는 profiles INSERT 시 next_exam_round 를 생략 →
-- 신규 프로필이 NULL 차수로 생성되어 차수 SSOT(profiles.next_exam_round)가 빈다.
-- 컬럼 DEFAULT 'first' 를 추가하면 모든 생성 경로(트리거·시드·수동 INSERT)가
-- 비-NULL 차수를 갖는다(트리거가 컬럼을 생략하므로 DB 기본값이 적용됨).
--
-- 안전: 기존 행은 변경하지 않는다(DEFAULT 는 이후 신규 INSERT 에만 적용). 추가·비파괴.
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260618_profiles_next_exam_round_default.sql
-- 롤백: scripts/sql/20260618_profiles_next_exam_round_default_rollback.sql
alter table public.profiles
  alter column next_exam_round set default 'first'::public.exam_round;

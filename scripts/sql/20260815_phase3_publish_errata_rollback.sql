-- Phase 3 발행 액션 롤백
-- ★주의: 이미 발행/철회된 원장 행의 상태는 되돌리지 않는다(발행 이력도 기록이다).
--   함수·컬럼만 제거. withdraws_revision_id 를 참조 중인 행이 있으면 컬럼 drop 이
--   실패하는 대신 cascade 로 값이 지워지므로, 철회 이력이 있으면 롤백 전 확인할 것.
begin;
drop function if exists fn_withdraw_errata(uuid, text);
drop function if exists fn_publish_errata(uuid[], text, text, text, jsonb, text, uuid);
drop function if exists private.is_publisher(uuid);
alter table publication_content_map drop column if exists source_discrepancy;
alter table content_revisions drop column if exists withdraws_revision_id;
alter table content_revisions drop column if exists withdrawn_at;
commit;

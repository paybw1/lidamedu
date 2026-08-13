-- Phase 2 (특허) 롤백 — 판본·매핑 제거 + 백필 원복
-- ★[2]로 삽입된 원장 10건은 no_delete 가드로 삭제 불가(설계 의도) — 롤백 후에도 잔존한다.
--   필요 시 상태만 정리: update content_revisions set merge_status='excluded'
--     where created_by_label='system:phase2_backfill';  (source_edition_id 는 dangling 무해 — FK 없음)
begin;
update problems
set source_doc_id = null
where problem_id in ('c6d39092-e986-4129-ba5b-3b2ca875f6cf', '093245f8-bb2b-4b59-b4a1-f0502e7a83d8', '14bcc00f-4f9b-493c-8ac5-7275535cd644')
  and source_doc_id = 'b83a2018-18ea-4174-bed4-716244297a9b';
drop view if exists v_current_editions;
drop table if exists publication_content_map;
drop table if exists publication_editions;
drop function if exists trg_edition_immutable();
drop table if exists publications;
commit;

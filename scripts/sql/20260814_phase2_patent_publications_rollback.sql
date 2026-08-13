-- Phase 2 (특허) 롤백 — 판본·매핑 전체 제거 + 백필 원복
begin;
-- 백필 3건 원복 (생성 시점 확정 ID — 다시 미연결 상태로)
update problems
set source_doc_id = null
where problem_id in ('c6d39092-e986-4129-ba5b-3b2ca875f6cf', '093245f8-bb2b-4b59-b4a1-f0502e7a83d8', '14bcc00f-4f9b-493c-8ac5-7275535cd644')
  and source_doc_id = 'b83a2018-18ea-4174-bed4-716244297a9b';
drop view if exists v_current_editions;
drop table if exists publication_content_map;
drop trigger if exists edition_immutable on publication_editions;
drop table if exists publication_editions;
drop function if exists trg_edition_immutable();
drop table if exists publications;
commit;

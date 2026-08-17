-- 특허 체계도 — 「재외자의 재판관할」 노드 신설 (원장 지시 2026-08-17)
--   위치: 총칙/보칙 > 복수 당사자대표(ord 5) 와 기일, 기간 및 추후보완(ord 6) 사이
--   제13조를 대리인 노드에서 이 노드로 이동 + 도해 t06(재외자의 재판관할)도 이 노드로.
--
-- ★트리 표시 순서는 parent_id + ord 로 결정된다(systematic-order.ts). path 의 b11 은
--   식별자일 뿐 순서와 무관하다 — b1..b10 이 이미 쓰여 다음 번호를 쓴다.

begin;

-- 1) 뒤 형제들 밀기 (ord 6~10 → 7~11)
update public.systematic_nodes
   set ord = ord + 1, updated_at = now()
 where parent_id = '022802a9-c424-4147-9318-05231f945a25'
   and ord >= 6;

-- 2) 새 노드
insert into public.systematic_nodes (law_code, parent_id, path, display_label, ord, case_only)
values (
  'patent',
  '022802a9-c424-4147-9318-05231f945a25',
  'patent.b1.b11',
  '재외자의 재판관할',
  6,
  false
);

-- 3) 제13조를 대리인 → 새 노드로 이동
update public.article_systematic_links
   set node_id = (select node_id from public.systematic_nodes
                   where law_code = 'patent' and path::text = 'patent.b1.b11')
 where article_id = 'd3f988a0-b6c4-4537-9fb8-e5657062948b'
   and node_id = '954bd09a-ee94-474a-8109-72a7113ee752';

-- 4) 도해 t06(재외자의 재판관할)도 새 노드로 이동
update public.dohae_unit_nodes
   set node_id = (select node_id from public.systematic_nodes
                   where law_code = 'patent' and path::text = 'patent.b1.b11')
 where unit_id = '2149954f-c643-4e7d-be1e-545c64f25841'
   and node_id = '954bd09a-ee94-474a-8109-72a7113ee752';

commit;

-- 확인
select n.path::text as path, n.display_label, n.ord,
       (select count(*) from public.article_systematic_links l where l.node_id = n.node_id) as articles,
       (select count(*) from public.dohae_unit_nodes d where d.node_id = n.node_id) as dohae_units
from public.systematic_nodes n
where n.parent_id = '022802a9-c424-4147-9318-05231f945a25'
order by n.ord;

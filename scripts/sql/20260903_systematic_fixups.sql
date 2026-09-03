-- feat: 체계도 반영 후 정리 2건.
--
-- ① 띄어쓰기만 다른 중복 — `신규성상실의 예외`(기존, 조문 연결 보유)와
--    `신규성 상실의 예외(法 36)`(신규). 매칭 키가 안쪽 공백을 무시하지 않아 둘 다 남았다.
--    ★기존 노드를 살리고 이름만 새 표기로 바꾼다. 붙어 있는 조문 연결이 유지된다.
--    신규 노드에 자식이 있으면 기존 노드 밑으로 옮긴 뒤 지운다.
update public.systematic_nodes
   set parent_id = '35e1acce-738e-45b7-8faa-d2c39eb7d836'
 where parent_id = '7ede1e89-f13e-45bb-9642-7eab8ef29d6c';

update public.systematic_nodes
   set display_label = '신규성 상실의 예외(法 36)'
 where node_id = '35e1acce-738e-45b7-8faa-d2c39eb7d836';

delete from public.systematic_nodes
 where node_id = '7ede1e89-f13e-45bb-9642-7eab8ef29d6c';

-- ② 「최신판례」는 목록 맨 끝에 와야 한다. 원본 체계도에 없는 노드라 옛 ord(11·14)를
--    그대로 갖고 있어, 새로 매긴 ord(0~191) 사이에 끼어 두 번째로 올라왔다.
update public.systematic_nodes n
   set ord = (select max(m.ord) + 10 from public.systematic_nodes m
               where m.law_code = n.law_code and m.parent_id is null)
 where n.parent_id is null
   and n.law_code in ('trademark', 'design')
   and n.display_label like '%최신판례%';

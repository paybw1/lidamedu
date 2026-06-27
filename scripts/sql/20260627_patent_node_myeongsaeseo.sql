-- 워크북 단원 "명세서의 기재방법"(객관식 Ⅰ/Ⅱ section)에 대응하는 systematic node 신설.
-- 특허 "[04] 특허를 받을 수 있는 출원"(b2.b4) 하위, 사용자 결정으로 별도 노드 분리.
-- 순서: 특허출원에 필요한 서류(b1) → 명세서의 기재방법(b2) → 하나의 특허출원의 범위(b3).
-- (생성은 b3 였으나 가운데로 이동 — 기존 '범위'를 b2.b4.b3 으로 밀고 명세서를 b2.b4.b2 로)
-- 운영(mcgdoplo) 적용 완료. node_id 는 실제 생성값(기록용, 재실행 안전).
insert into public.systematic_nodes
  (node_id, law_code, parent_id, path, display_label, ord, case_only)
values
  ('4aa8be75-59aa-4720-a49e-0599235bcf53', 'patent',
   'fb9f4fd6-4409-41ae-af6c-7da83605407f', 'patent.b2.b4.b2'::ltree,
   '명세서의 기재방법', 2, false)
on conflict (node_id) do nothing;
-- 하나의 특허출원의 범위 → b3 ord 3 (명세서에 자리 양보).
update public.systematic_nodes
  set path = 'patent.b2.b4.b3'::ltree, ord = 3
  where node_id = '9d7d1f0f-2d99-4796-9d12-f0db376cb816';

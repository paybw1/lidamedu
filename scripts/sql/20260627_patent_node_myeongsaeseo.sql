-- 워크북 단원 "명세서의 기재방법"(객관식 Ⅰ/Ⅱ section)에 대응하는 systematic node 신설.
-- 특허 "[04] 특허를 받을 수 있는 출원"(b2.b4) 하위, 사용자 결정으로 별도 노드 분리.
-- 운영(mcgdoplo) 적용 완료. node_id 는 실제 생성값(기록용, 재실행 안전).
insert into public.systematic_nodes
  (node_id, law_code, parent_id, path, display_label, ord, case_only)
values
  ('4aa8be75-59aa-4720-a49e-0599235bcf53', 'patent',
   'fb9f4fd6-4409-41ae-af6c-7da83605407f', 'patent.b2.b4.b3'::ltree,
   '명세서의 기재방법', 3, false)
on conflict (node_id) do nothing;

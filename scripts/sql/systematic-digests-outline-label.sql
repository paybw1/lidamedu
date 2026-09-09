-- 정리비교표 중에는 체계도 **노드에 붙지 않는** 것이 있다.
-- 2p 특허법 체계도는 어느 한 단원의 자료가 아니라 과목 전체 지도라, 정리 화면 목차에
-- 자기 이름으로 맨 앞에 선다(원장 지시 2026-09-09).
--
-- ★체계도 노드를 새로 만들지 않는다 — 노드는 조문·판례·주관식 화면이 함께 쓰므로
--   정리 화면 하나 때문에 추가하면 세 화면 목차가 같이 바뀐다.
alter table public.systematic_digests
  add column if not exists outline_label text;

comment on column public.systematic_digests.outline_label is
  '노드에 붙지 않는 자료(node_id is null)의 정리 화면 목차 이름. 노드에 붙으면 무시된다.';

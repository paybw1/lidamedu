-- 미핀 14건(body매칭 O, primary_node_id NULL → 파생매핑 의존으로 단원 색인서 누락 가능) → 워크북 섹션 노드로 핀.
-- emit-unpinned-pins.mjs 자동생성분(적용 완료 스냅샷). 전부 cand=1(유일 본문매칭), ambiguous 0. 순수 추가(기존 핀 미덮어쓰기).
-- a12290ca는 직무발명 내용이나 워크북 섹션(특허받을권리) 기준 베이스라인 핀 — 직무발명 하위노드 정밀화는 후속.
-- 롤백: 각 problem_id primary_node_id = NULL.
update problems set primary_node_id = 'c489bb78-61b6-4af7-9704-8c1cb934e5c6', updated_at = now() where problem_id = '462e0ddf-eeaf-4336-b4ef-39b84dc38d4a'; -- [목적] 기출#1
update problems set primary_node_id = 'e2145cae-6ae1-4bcb-b477-824e5a9f37d4', updated_at = now() where problem_id = '7439c477-0b73-4690-bcc3-f5f122dde389'; -- [발명] 기출#4
update problems set primary_node_id = 'e2145cae-6ae1-4bcb-b477-824e5a9f37d4', updated_at = now() where problem_id = 'd24cf8cb-b08f-4d12-ad90-fb616f14bfa2'; -- [발명] 기출#6
update problems set primary_node_id = 'e2145cae-6ae1-4bcb-b477-824e5a9f37d4', updated_at = now() where problem_id = '9c9b6305-7721-48a9-ab2a-fd8a97c3d5cd'; -- [발명] 예상#4
update problems set primary_node_id = '6b26d54d-89c3-4697-86ee-4e8dff3da999', updated_at = now() where problem_id = 'b6da2bfa-c84a-4c9f-b588-7e937540d88d'; -- [절차의 정지] 예상#4
update problems set primary_node_id = '6b26d54d-89c3-4697-86ee-4e8dff3da999', updated_at = now() where problem_id = '7df5c694-d847-4f94-b724-6b7f57ed853e'; -- [절차의 정지] 예상#7
update problems set primary_node_id = '8692dd8d-74b7-4ad8-ad0e-105a224eda98', updated_at = now() where problem_id = 'f02e0fe7-e49e-4af0-933f-5e428ce827d7'; -- [출원인] 예상#2
update problems set primary_node_id = 'c98c0fe7-e529-42ca-a40d-ffa5e9895939', updated_at = now() where problem_id = 'a12290ca-8bd2-4501-b101-a64f72f57e87'; -- [특허를 받을 수 있는 권리] 예상#8 (직무발명 내용)
update problems set primary_node_id = '4aa8be75-59aa-4720-a49e-0599235bcf53', updated_at = now() where problem_id = '3a61ef8e-c9fa-4030-80d3-b15b2b73bd12'; -- [명세서의 기재방법] 기출#6
update problems set primary_node_id = '9d7d1f0f-2d99-4796-9d12-f0db376cb816', updated_at = now() where problem_id = 'db2d71dd-bb0d-4575-8345-d1130ea89304'; -- [하나의 특허출원의 범위] 기출#1
update problems set primary_node_id = '781588a5-75a3-4078-b118-4412eec10655', updated_at = now() where problem_id = '35153d6e-7670-4419-9dac-ec3eba2e1e16'; -- [실체보정] 예상#16
update problems set primary_node_id = '3ed2a462-9909-49ff-a177-35197b66ae57', updated_at = now() where problem_id = '6949bef0-b1e1-4931-b51a-242795eab0bc'; -- [심사청구제도] 예상#7
update problems set primary_node_id = '0ce80b6d-208f-4a68-972e-d009c1bd40d5', updated_at = now() where problem_id = '10afcf57-a151-46b8-9113-ab30a1e2afd1'; -- [국선대리인, 전문심리위원 및 참고인] 예상#2
update problems set primary_node_id = '11b02956-6a7e-4ae1-892b-1a4382cd27c6', updated_at = now() where problem_id = 'f0df155b-7a99-4d59-9050-f7815ee6b905'; -- [보상금액 또는 대가에 대한 소송] 예상#2

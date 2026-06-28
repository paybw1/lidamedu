-- 무매칭 14건 정밀조사 결과: 진짜 누락 0건. 9건은 이미 정확, 5건이 미핀/오배치로 단원 갭 유발 → 재핀.
-- (audit 본문매칭 실패 원인: <div class="case-box"> HTML 래퍼·markdown 표·발문에 박스내용 혼입 등 본문변형)
-- 롤백: 88261d48 → 보상금액소송(11b02956), 나머지 4건 → NULL(미핀 원복).
update problems set primary_node_id = '4aa8be75-59aa-4720-a49e-0599235bcf53', updated_at = now() where problem_id = '88261d48-df6b-4efe-8ce1-204b482c5789'; -- [명세서의 기재방법] 예상#11: "보상금액 또는 대가에 대한 소송"(오배치) → "명세서의 기재방법"
update problems set primary_node_id = '781588a5-75a3-4078-b118-4412eec10655', updated_at = now() where problem_id = '41864f7a-c6cf-4099-b90f-0bae910d47f5'; -- [실체보정] 예상#17: 미핀(표형식) → "실체보정"
update problems set primary_node_id = '781588a5-75a3-4078-b118-4412eec10655', updated_at = now() where problem_id = '5b2d13a3-66df-4a4f-a335-d061f3d92b6b'; -- [실체보정] 예상#18: 미핀(표형식) → "실체보정"
update problems set primary_node_id = '781588a5-75a3-4078-b118-4412eec10655', updated_at = now() where problem_id = 'f2454273-43e5-44c6-93bb-78dc3cb86c78'; -- [실체보정] 예상#20: 미핀(오역정정 표형식) → "실체보정"
update problems set primary_node_id = '40705add-345d-441a-9d96-077c5e5324ad', updated_at = now() where problem_id = '3506c0c5-9ad8-40bf-a785-7ad4d181783d'; -- [특허소송] 예상#12: 미핀(case-box HTML) → "특허소송"

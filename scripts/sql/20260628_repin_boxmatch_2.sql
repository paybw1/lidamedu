-- 박스형(박스 시그니처 완전일치) 정밀 재핀 2건. 발문 generic 으로 본문매칭 불가 → 박스 항목 전체 일치로 식별.
-- 롤백: 693b3241 → NULL(미핀 원복) / 2b746e37 → 본안심리(c64266d5).
update problems set primary_node_id = '290eaff9-472a-4a1b-b1d0-c2a404f8c51a', updated_at = now() where problem_id = '693b3241-256d-4152-8b5c-032db011d856'; -- [기일,기간및추후보완] 예상#6: 미핀 → "기일, 기간 및 추후보완"
update problems set primary_node_id = '7c880fa1-5418-4dd0-bc98-2a9ee124fcc8', updated_at = now() where problem_id = '2b746e37-2b16-484d-90bc-0814abbb6b76'; -- [출원공개제도] 예상#8: "본안심리" → "출원공개제도"

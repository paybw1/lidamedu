-- feat-2-026 후속 — 워크북(source/_converted/problems-merged.json) 복수정답 3건 DB 반영.
-- 워크북 correctList 가 복수(>1)인데 DB 는 단일로만 is_correct 체크돼 있던 것(under-marked)을 정정.
-- 선지 본문이 DB↔워크북 완전 일치함을 확인한 뒤, 누락된 정답 인덱스만 is_correct=true 로 추가(ADD-only).
-- "하나만 골라도 정답" 채점 + "정답 전부 표시" 는 이미 코드에 반영돼 있어, is_correct 만 맞추면 됨.
--
--   특허 2021-8 (공지예외적용주장출원, 206730a6): [2] → [2,4]   (#4 추가)
--   특허 2021-9 (침해의 종류,          3b0cdef7): [3] → [3,5]   (#5 추가)
--   특허 2003-2 (국제조약,             5897433c): [1] → [1,3]   (#3 추가)
--
-- 권위 주의: 워크북(강사 교재) 기준. 공단 공식 복수정답과 대조는 별도(사용자 지시=워크북).
-- 롤백: 위 (problem_id, 추가한 index) 의 is_correct 를 false 로 되돌리면 됨.

update problem_choices set is_correct = true
where (problem_id = '206730a6-a2c6-4d9c-8c66-30668beec378' and choice_index = 4)
   or (problem_id = '3b0cdef7-5280-4eb5-aecb-b0291ff8a26e' and choice_index = 5)
   or (problem_id = '5897433c-5c55-4843-8277-8f4afba45d47' and choice_index = 3);

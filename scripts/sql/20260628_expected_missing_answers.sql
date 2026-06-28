-- 예상문제(origin=expected) 정답 감사 후속 — 워크북(expected 답안 문서)에 정답이 있는데
-- DB 엔 정답 0개로 누락돼 있던 draft 2건을 워크북 correctIndex 로 복구.
-- DB 선지 본문이 워크북과 완전 일치함을 확인 후 해당 인덱스만 is_correct=true.
--
--   전용실시권 #1 (641c73dd) "전용실시권에 대한 설명 중 옳지 않은 것은?" → 정답 3
--     (3: "전용실시권은 특허권자의 허락이 없으면 타인에게 이전할 수 없다" = 틀린 진술)
--   법정실시권 #1 (fbaee372) "법정실시권에 대한 내용이다. 옳은 것은?"      → 정답 4
--     (4: "모든 법정실시권은 특허권자의 동의가 있을 경우에는 이전할 수 있다")
--
-- 둘 다 review_status=draft (학생 비노출). 워크북 권위(예상 답안 문서의 "N 정답" 마커).
-- 정당한권리자 #2 (3b9377f4) 는 워크북에 정답 자체가 없어(592개 중 유일) 여기서 제외 — 사용자 확인 대상.

update problem_choices set is_correct = true
where (problem_id = '641c73dd-f419-4982-8357-d3bca98a908a' and choice_index = 3)
   or (problem_id = 'fbaee372-0d6e-4f88-8a3c-6376e57e0ac7' and choice_index = 4);

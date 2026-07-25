-- feat-2-032 — 특허 2차 채점평이 explanation_md(해설)에 잘못 저장돼 있던 것을 정리.
--   problem_grading_notes 로 재적재 완료(96건) → 중복 제거. 해당 행은 채점평 전문만 담고
--   있어(해설 아님) 안전. 사용자 명시 승인 후 실행(2026-07-26).
update public.problems
set explanation_md = null
where exam_round = 'second'
  and format = 'subjective'
  and explanation_md like '## 채점평%'
  and deleted_at is null;

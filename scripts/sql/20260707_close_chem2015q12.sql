-- 2015 화학 12번 종결 — 원본 문제에 구조식 이미지 결손으로 해설 작성 불가(사용자 확인).
-- 검수 큐의 pending 드래프트를 반려 처리(불일치 큐 비움), 문제는 draft 숨김 유지.
update problem_explanation_drafts d
set status = 'rejected',
    note = '원본 문제 구조식 이미지 결손 — 해설 작성 불가(2026-07-06 확인). 문제는 학생 숨김(draft) 유지.',
    reviewed_at = now(),
    reviewed_by = (select profile_id from profiles where role='admin' and name='임병웅' limit 1)
from problems p
where d.problem_id = p.problem_id
  and p.science_subject = 'chemistry' and p.year = 2015 and p.problem_number = 12
  and d.status = 'pending';

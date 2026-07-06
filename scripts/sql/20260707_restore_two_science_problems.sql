-- 해설·정답 확정된 2015 물리 2번 / 2017 물리 4번 학생 노출 복원.
-- (2026-06-16 결함 의심으로 draft 숨김했던 것 — 원본 해설로 해소됨.
--  2015 화학 12번은 구조식 결손 미해결이라 draft 유지.)
update problems
set review_status = 'approved', updated_at = now()
where problem_id in (
  'dd113dc1-68da-4b20-9972-bf47c39a4b92', -- 2015 물리 2
  '597bfd73-5dcc-4671-a8a3-3fe9b7c3b7d4'  -- 2017 물리 4
) and review_status = 'draft';

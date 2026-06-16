-- 보류 3문항 학생 숨김: problems.review_status 'approved' → 'draft'.
-- 정답키(is_correct)·본문(body_md)·해설(explanation_md) 무변경 — review_status만 변경.
-- 자연과학 학생 쿼리(science.server.ts)가 review_status='approved' 필터를 거므로 학생에게서 숨겨짐(스태프는 무관).
-- 사유: 본문은 원본 확인됐으나 정답키와 불일치(문항/정답 결함 의심) — 전문가 검토 대기.
--   2015 물리 q2(키 ④ ↔ I=3이면 정답 없음) · 2017 물리 q4(키 ⑤ ↔ B=m이면 정답 없음) · 2015 화학 q12(구조식 결손).
-- 복원: review_status 를 'approved' 로 되돌림(_rollback).
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260616_hide_unresolved_3_science.sql
begin;
update public.problems set review_status = 'draft', updated_at = now()
  where problem_id in (
    'dd113dc1-68da-4b20-9972-bf47c39a4b92',  -- 2015 물리 q2
    '597bfd73-5dcc-4671-a8a3-3fe9b7c3b7d4',  -- 2017 물리 q4
    '2349eb17-8226-4cf8-ace6-cdd0b73bd031'   -- 2015 화학 q12
  )
  and review_status = 'approved';
commit;

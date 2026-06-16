-- 롤백 — 보류 3문항 review_status 'draft' → 'approved'(다시 학생 노출).
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260616_hide_unresolved_3_science_rollback.sql
begin;
update public.problems set review_status = 'approved', updated_at = now()
  where problem_id in (
    'dd113dc1-68da-4b20-9972-bf47c39a4b92',  -- 2015 물리 q2
    '597bfd73-5dcc-4671-a8a3-3fe9b7c3b7d4',  -- 2017 물리 q4
    '2349eb17-8226-4cf8-ace6-cdd0b73bd031'   -- 2015 화학 q12
  )
  and review_status = 'draft';
commit;

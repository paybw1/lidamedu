-- 미실재 판정 2건의 출처 문맥.
WITH want(no) AS (VALUES ('2007다5069'),('98다54434')),
src AS (
  SELECT c.case_id, c.case_number, c.court, c.decided_at,
         concat_ws(E'\n', c.summary_body_md, c.reasoning_md, c.comment_body_md, c.summary_items::text) AS body
    FROM public.cases c WHERE c.deleted_at IS NULL
)
SELECT w.no, s.case_number AS host_case, s.court, s.decided_at,
       substring(s.body from greatest(1, position(w.no in s.body) - 90) for 210) AS ctx
  FROM want w JOIN src s ON s.body LIKE '%' || w.no || '%'
 ORDER BY w.no;

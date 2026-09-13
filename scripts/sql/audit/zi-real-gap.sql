-- 진짜 빈 곳이 어디인가. 종합해설(problems)·선지해설·박스해설을 한 눈에.
WITH ex AS (
  SELECT p.problem_id, p.display_no, p.explanation_md
    FROM public.problems p JOIN public.laws l ON l.law_id = p.law_id
   WHERE p.deleted_at IS NULL AND l.law_code='patent' AND p.origin='expected'
), c AS (SELECT problem_id, count(*) FILTER (WHERE btrim(coalesce(explanation_md,'')) <> '') AS n FROM public.problem_choices GROUP BY problem_id),
   b AS (SELECT problem_id, count(*) FILTER (WHERE btrim(coalesce(explanation_md,'')) <> '') AS n FROM public.problem_box_items GROUP BY problem_id)
SELECT CASE WHEN btrim(coalesce(ex.explanation_md,'')) <> '' THEN '종합해설 있음' ELSE '종합해설 없음' END AS 종합,
       CASE WHEN coalesce(c.n,0)+coalesce(b.n,0) > 0 THEN '하위해설 있음' ELSE '하위해설 없음' END AS 하위,
       count(*) AS 문항수,
       round(avg(length(coalesce(ex.explanation_md,'')))) AS 종합해설_평균길이
  FROM ex LEFT JOIN c ON c.problem_id=ex.problem_id LEFT JOIN b ON b.problem_id=ex.problem_id
 GROUP BY 1,2 ORDER BY 1,2;

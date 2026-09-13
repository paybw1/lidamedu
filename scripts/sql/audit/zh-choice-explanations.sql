-- ★적재 대상으로 삼았던 문항들이 정말 「해설 없음」이었나.
--   선지별 해설(problem_choices.explanation_md)·박스별 해설을 함께 센다.
WITH ex AS (
  SELECT p.problem_id, p.display_no, p.explanation_md
    FROM public.problems p JOIN public.laws l ON l.law_id = p.law_id
   WHERE p.deleted_at IS NULL AND l.law_code='patent' AND p.origin='expected'
), c AS (
  SELECT problem_id,
         count(*) FILTER (WHERE explanation_md IS NOT NULL AND btrim(explanation_md) <> '') AS 선지해설수,
         sum(length(coalesce(explanation_md,''))) AS 선지해설길이
    FROM public.problem_choices GROUP BY problem_id
), b AS (
  SELECT problem_id,
         count(*) FILTER (WHERE explanation_md IS NOT NULL AND btrim(explanation_md) <> '') AS 박스해설수,
         sum(length(coalesce(explanation_md,''))) AS 박스해설길이
    FROM public.problem_box_items GROUP BY problem_id
)
SELECT count(*) AS 예상문제,
       count(*) FILTER (WHERE coalesce(c.선지해설수,0) > 0) AS 선지해설_있음,
       count(*) FILTER (WHERE coalesce(b.박스해설수,0) > 0) AS 박스해설_있음,
       count(*) FILTER (WHERE coalesce(c.선지해설수,0) > 0 OR coalesce(b.박스해설수,0) > 0) AS 둘중_있음,
       count(*) FILTER (WHERE coalesce(c.선지해설수,0) = 0 AND coalesce(b.박스해설수,0) = 0) AS 아예_없음,
       sum(coalesce(c.선지해설길이,0) + coalesce(b.박스해설길이,0)) AS 총_하위해설_글자
  FROM ex LEFT JOIN c ON c.problem_id = ex.problem_id LEFT JOIN b ON b.problem_id = ex.problem_id;

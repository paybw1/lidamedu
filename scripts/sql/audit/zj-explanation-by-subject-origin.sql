-- 해설 세 층을 과목 × origin 으로 함께 집계.
-- ★law_id 가 NULL 인 자연과학 688건이 빠지지 않도록 LEFT JOIN + subject_type 폴백.
WITH p AS (
  SELECT pr.problem_id,
         coalesce(l.law_code, pr.subject_type::text, '(미분류)') AS 과목,
         pr.origin::text AS origin,
         length(coalesce(pr.explanation_md, '')) AS 종합len
    FROM public.problems pr
    LEFT JOIN public.laws l ON l.law_id = pr.law_id
   WHERE pr.deleted_at IS NULL
), c AS (
  SELECT problem_id, sum(length(coalesce(explanation_md, ''))) AS 선지len
    FROM public.problem_choices GROUP BY problem_id
), b AS (
  SELECT problem_id, sum(length(coalesce(explanation_md, ''))) AS 박스len
    FROM public.problem_box_items GROUP BY problem_id
), j AS (
  SELECT p.*, coalesce(c.선지len, 0) AS 선지len, coalesce(b.박스len, 0) AS 박스len
    FROM p LEFT JOIN c ON c.problem_id = p.problem_id
           LEFT JOIN b ON b.problem_id = p.problem_id
)
SELECT 과목, origin,
       count(*)                                                   AS 문항수,
       count(*) FILTER (WHERE 종합len > 0)                         AS 종합해설_보유,
       sum(종합len)                                                AS 종합해설_총자,
       round(avg(종합len))                                         AS 종합해설_문항당,
       count(*) FILTER (WHERE 선지len > 0)                         AS 선지해설_보유,
       sum(선지len)                                                AS 선지해설_총자,
       round(avg(선지len))                                         AS 선지해설_문항당,
       count(*) FILTER (WHERE 박스len > 0)                         AS 박스해설_보유,
       sum(박스len)                                                AS 박스해설_총자,
       count(*) FILTER (WHERE 종합len = 0 AND 선지len = 0)          AS "종합·선지_둘다빈것",
       count(*) FILTER (WHERE 종합len = 0 AND 선지len = 0 AND 박스len = 0) AS 세층_모두빈것
  FROM j
 GROUP BY 과목, origin
 ORDER BY 과목, count(*) DESC;

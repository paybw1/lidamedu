-- 적재 후 2-1 SQL 이 잡을 모집단을 미리 센다(예측값 보정용).
SELECT count(*)                                              AS expected_전체,
       count(*) FILTER (WHERE explanation_md IS NOT NULL)    AS 현재_비NULL,
       count(*) FILTER (WHERE explanation_md IS NULL)        AS 현재_NULL
  FROM public.problems p
  JOIN public.laws l ON l.law_id = p.law_id
 WHERE p.deleted_at IS NULL AND l.law_code = 'patent' AND p.origin = 'expected';

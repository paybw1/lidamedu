-- 민법 해설 30건 표본. ★problems 에 subject 컬럼은 없다 — laws.law_code='civil' 이 과목이다.
--   재현 가능: 정렬키 md5(problem_id) 라 몇 번을 돌려도 같은 30건.
SELECT p.problem_id AS id,
       l.law_code   AS subject,
       p.display_no,
       length(p.explanation_md) AS len,
       p.explanation_md AS body
  FROM public.problems p
  JOIN public.laws l ON l.law_id = p.law_id
 WHERE p.deleted_at IS NULL
   AND p.explanation_md IS NOT NULL
   AND l.law_code = 'civil'
 ORDER BY md5(p.problem_id::text)
 LIMIT 30;

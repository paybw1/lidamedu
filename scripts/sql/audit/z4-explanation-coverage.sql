-- 과목 × 소스문서별 해설 보유율. source_doc 이 없는 문항도 함께 센다.
SELECT l.law_code AS 과목,
       coalesce(d.label, '(소스문서 없음)') AS 문서,
       coalesce(d.kind::text, '-')        AS kind,
       count(*)                                                    AS 문항수,
       count(*) FILTER (WHERE p.explanation_md IS NOT NULL)         AS 해설있음,
       round(100.0*count(*) FILTER (WHERE p.explanation_md IS NOT NULL)/count(*),1) AS 보유율,
       count(*) FILTER (WHERE p.explanation_md IS NOT NULL AND length(p.explanation_md) < 100) AS "해설<100자"
  FROM public.problems p
  JOIN public.laws l ON l.law_id = p.law_id
  LEFT JOIN public.problem_source_docs d ON d.source_doc_id = p.source_doc_id
 WHERE p.deleted_at IS NULL
 GROUP BY l.law_code, d.label, d.kind
 ORDER BY l.law_code, count(*) DESC;

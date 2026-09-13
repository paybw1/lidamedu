-- z4 는 laws 를 INNER JOIN 했다 — law_id 가 비면 빠진다. 자연과학 679 가 여기 있는가.
SELECT coalesce(l.law_code, '(law_id 없음)') AS 과목,
       coalesce(d.label, '(소스문서 없음)')   AS 문서,
       count(*) AS 문항수,
       count(*) FILTER (WHERE p.explanation_md IS NOT NULL) AS 해설있음
  FROM public.problems p
  LEFT JOIN public.laws l ON l.law_id = p.law_id
  LEFT JOIN public.problem_source_docs d ON d.source_doc_id = p.source_doc_id
 WHERE p.deleted_at IS NULL AND p.law_id IS NULL
 GROUP BY l.law_code, d.label ORDER BY count(*) DESC;

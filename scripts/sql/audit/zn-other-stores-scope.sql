-- 나머지 저장소가 어느 과목·origin 것인가.
SELECT '해설초안(problem_explanation_drafts)' AS 저장소,
       coalesce(l.law_code, p.subject_type::text) AS 과목, p.origin::text AS origin,
       count(*) AS 문항, sum(length(coalesce(d.content_md,''))) AS 총자,
       count(*) FILTER (WHERE d.status::text = 'approved') AS 승인
  FROM public.problem_explanation_drafts d
  JOIN public.problems p ON p.problem_id = d.problem_id
  LEFT JOIN public.laws l ON l.law_id = p.law_id
 GROUP BY 1,2,3
UNION ALL
SELECT '채점노트(problem_grading_notes)',
       coalesce(l.law_code, p.subject_type::text), p.origin::text,
       count(*), sum(length(coalesce(g.body_md,''))), NULL
  FROM public.problem_grading_notes g
  JOIN public.problems p ON p.problem_id = g.problem_id
  LEFT JOIN public.laws l ON l.law_id = p.law_id
 GROUP BY 1,2,3
UNION ALL
SELECT '모범답안(problems.model_answer_md)',
       coalesce(l.law_code, p.subject_type::text), p.origin::text,
       count(*), sum(length(p.model_answer_md)), NULL
  FROM public.problems p LEFT JOIN public.laws l ON l.law_id = p.law_id
 WHERE p.deleted_at IS NULL AND btrim(coalesce(p.model_answer_md,'')) <> ''
 GROUP BY 1,2,3
 ORDER BY 1,2,3;

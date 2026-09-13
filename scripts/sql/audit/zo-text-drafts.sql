SELECT coalesce(l.law_code, p.subject_type::text) AS 과목, p.origin::text AS origin,
       count(*) AS 문항, sum(length(coalesce(d.stem_md,''))) AS 총자
  FROM public.problem_text_drafts d
  JOIN public.problems p ON p.problem_id = d.problem_id
  LEFT JOIN public.laws l ON l.law_id = p.law_id
 GROUP BY 1,2;

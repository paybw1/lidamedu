SELECT count(*) FILTER (WHERE length(pr.explanation_md) < 100) AS under_100,
       count(*) FILTER (WHERE length(pr.explanation_md) < 20)  AS under_20,
       count(*) AS total
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL AND l.law_code = 'patent';

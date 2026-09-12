SELECT to_char(date_trunc('month', pr.created_at), 'YYYY-MM') AS m, count(*) AS n,
       round(avg(length(pr.explanation_md))) AS avg_len
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL AND l.law_code = 'patent'
 GROUP BY 1 ORDER BY 1;

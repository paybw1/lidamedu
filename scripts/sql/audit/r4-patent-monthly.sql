-- 월별 × 품질지표 (특허 해설). ★problems 에 law_code 없음 — laws 조인으로 치환.
SELECT to_char(date_trunc('month', pr.created_at), 'YYYY-MM') AS m,
       count(*) AS n,
       round(avg(length(pr.explanation_md))) AS avg_len,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '[「『"“][^」』"”]{40,}[」』"”]')/count(*),1) AS pct_quote,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '제\s*\d+\s*조')/count(*),1) AS pct_art,
       round(100.0*count(*) FILTER (WHERE length(pr.explanation_md) < 100)/count(*),1) AS pct_thin
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL
   AND l.law_code = 'patent'
 GROUP BY 1 ORDER BY 1;

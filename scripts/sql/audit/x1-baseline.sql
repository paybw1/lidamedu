-- 적재 전 기준선 — 특허 해설 origin별. ★problems 에 law_code 없음 → laws 조인으로 치환.
SELECT pr.origin::text AS origin,
       count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY length(pr.explanation_md))::int AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY length(pr.explanation_md))::int AS p95,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '제\s*\d+\s*조')/count(*),1) AS pct_article,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '\d{2,4}\s*(후|허|다|두|도|나|누|마|그|스)\s*\d+')/count(*),1) AS pct_caseno,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '[「『"“][^」』"”]{40,}[」』"”]')/count(*),1) AS pct_longquote,
       round(100.0*count(*) FILTER (WHERE length(pr.explanation_md) < 100)/count(*),1) AS pct_thin
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL
   AND l.law_code = 'patent'
 GROUP BY pr.origin
 ORDER BY count(*) DESC;
